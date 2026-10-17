# dsh-zai-usage

Z.AI coding-plan quota panel in the DSH sidebar.

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin,
packaged as a DSH bundle: `package.json` declares `dsh.bundle.patch`, and
`cordis.patch.yml` inserts the `zai-usage` row into the active profile.
The client half is served from `lib/client.js` (`dsh.client.platform: web`).

## Install

- Desktop app: **Plugins** → install `github:bosenok/dsh-zai-usage` (private repository:
  give the machine git access), then enable the bundle.
- CLI: `dsh plugin --profile <profile> add github:bosenok/dsh-zai-usage`.
- Local checkout: `dsh plugin --profile <profile> add file:/path/to/dsh-zai-usage`.

Enabling the bundle mounts the plugin; HMR applies it to a running app, and a
restart makes sure the client half is rebuilt.

## Where the key comes from

The host half declares `inject: ['credentials']` and resolves the key through the
harness credential service — the same canonical seam the Z.AI provider itself
uses:

```js
const resolved = await ctx.credentials.resolve('ZAI_API_KEY')
```

So there is nothing plugin-specific to configure. The value is found in the
service's layers: the credential store written when the Z.AI provider is
configured (`~/.dsh/.credentials.yaml` → `refs`), or the environment layers
(`~/.dsh/.env`, inherited environment, the project's `.env`). The value never
reaches the browser: the client half renders the quota snapshot only.

Missing key: the panel shows `ZAI_API_KEY is not set in the credential store`, and
the snapshot `~/.dsh/usage/zai-usage.json` carries `debug` with the resolution
state (`credsService`, `resolve`) — for instance
`{"credsService":"ok","resolve":"value(49) source=file"}`.

## Development

`lib/` is built and committed; the sources live in `src/`. Rebuild the client with
the repository's Vite config (`npx vite build` → `dist/`, then the wrapper in
`build/wrapper.js` produces `lib/client.js`).

## License

MIT — see [LICENSE](LICENSE). Third-party code bundled into `lib/` and its
licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
