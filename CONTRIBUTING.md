# Contributing

Thanks for taking the time to contribute.

## Development setup

- Node.js 20+ (see `package.json` `engines`)
- npm

```bash
npm install
cp .env.example .env
npm run dev
```

### Useful commands

```bash
npm run lint
npm test
npm run build
```

## Project structure

- `src/` runtime code
- `test/` tests

## Pull requests

- Keep changes focused and easy to review.
- Include tests for behavior changes.
- Avoid unrelated refactors.
- Make sure `npm run lint`, `npm test`, and `npm run build` pass.

## Security issues

Please do not open public issues for vulnerabilities. See `SECURITY.md`.
