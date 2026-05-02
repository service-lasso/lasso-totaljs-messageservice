# lasso-totaljs-messageservice

Service Lasso package repo for the Total.js Message Service app.

The release pipeline packages the app with production `npm` dependencies already installed, publishes OS-specific archives, and publishes the matching `service.json` manifest.

## Service Contract

- Service id: `totaljs-messageservice`
- Runtime dependency: `@node`
- Default port: `8112`
- Healthcheck: `GET /` must return `404`
- Global environment exported to dependants:
  - `MESSAGESERVICE_URL=http://127.0.0.1:${SERVICE_PORT}`
  - `MESSAGESERVICE_PORT=${SERVICE_PORT}`

## Release Assets

Each release contains:

- `lasso-totaljs-messageservice-12.0.0-win32.zip`
- `lasso-totaljs-messageservice-12.0.0-linux.tar.gz`
- `lasso-totaljs-messageservice-12.0.0-darwin.tar.gz`
- `service.json`
- `SHA256SUMS.txt`

## Local Verification

```powershell
npm test
```

The verification packages the current OS, extracts the archive, starts the packaged service through the wrapper, and checks the HTTP health status.
