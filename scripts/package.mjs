import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serviceVersion = process.env.TOTALJS_MESSAGESERVICE_VERSION ?? "12.0.0";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;

const targets = {
  win32: { archiveType: "zip" },
  linux: { archiveType: "tar.gz" },
  darwin: { archiveType: "tar.gz" },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}: ${result.error?.message ?? "unknown error"}`);
  }
}

function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", ["npm", ...args].join(" ")], options);
    return;
  }

  run("npm", args, options);
}

function versionedAssetName(version, platform, archiveType) {
  return `lasso-totaljs-messageservice-${version}-${platform}.${archiveType === "zip" ? "zip" : "tar.gz"}`;
}

async function compressPackage(packageRoot, outputPath, archiveType) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  if (archiveType === "zip") {
    run("powershell", [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${JSON.stringify(path.join(packageRoot, "*"))} -DestinationPath ${JSON.stringify(outputPath)} -Force`,
    ]);
    return outputPath;
  }

  run("tar", ["-czf", outputPath, "-C", packageRoot, "."]);
  return outputPath;
}

export async function packageMessageService(platform = targetPlatform, version = serviceVersion) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform: ${platform}. Supported platforms: ${Object.keys(targets).join(", ")}.`);
  }

  const outputRoot = path.join(repoRoot, "output", "package", version, platform);
  const packageRoot = path.join(outputRoot, "payload");
  const appRoot = path.join(packageRoot, "app");
  const outputPath = path.join(repoRoot, "dist", versionedAssetName(version, platform, target.archiveType));

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await cp(path.join(repoRoot, "app"), appRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}node_modules${path.sep}`) && !source.endsWith(`${path.sep}index.pid`),
  });

  runNpm(["ci", "--omit=dev"], { cwd: appRoot });

  await writeFile(path.join(packageRoot, "lasso-totaljs-messageservice.mjs"), launcherSource, "utf8");
  await writeFile(
    path.join(packageRoot, "SERVICE-LASSO-PACKAGE.json"),
    `${JSON.stringify(
      {
        serviceId: "totaljs-messageservice",
        upstream: {
          source: "TypeRefinery donor service",
          donorPath: "services/totaljs-messageservice",
          version,
        },
        packagedBy: "service-lasso/lasso-totaljs-messageservice",
        platform,
        arch: "x64",
        command: "node ./lasso-totaljs-messageservice.mjs",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (platform !== "win32") {
    await chmod(path.join(packageRoot, "lasso-totaljs-messageservice.mjs"), 0o755);
  }

  await compressPackage(packageRoot, outputPath, target.archiveType);
  console.log(`[lasso-totaljs-messageservice] packaged ${outputPath}`);
  return outputPath;
}

const launcherSource = String.raw`import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(packageRoot, "app");
const servicePort = process.env.SERVICE_PORT || process.env.MESSAGESERVICE_PORT || "8112";

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "production",
  SERVICE_PORT: servicePort,
  MESSAGESERVICE_PORT: servicePort,
  MESSAGESERVICE_URL: process.env.MESSAGESERVICE_URL || ` + "`http://127.0.0.1:${servicePort}`" + `,
};

const child = spawn(process.execPath, ["index.js", "--release"], {
  cwd: appRoot,
  env,
  stdio: "inherit",
});

function stop(signal) {
  if (!child.killed) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packageMessageService();
}
