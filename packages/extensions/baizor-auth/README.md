# @deepseek-ai/dsh-baizor-auth

English | [中文](README.zh.md)

Baizor AI browser login, host half: one device-flow login at a time. The `baizorAuth` Typert Remote mints a token, hands the browser a `baizor.com` sign-in URL, polls the CLI endpoint until it answers, then applies the issued key to the credential store, the `baizorai` provider profile to the `llm-pi-ai` settings section, and the server-returned default model to the shared Agent default.

## Model Experience

Indirectly, through the provider settings and default model the completed login writes; request assembly and provider adapters own every model-visible request.

#### KV Cache effect

None: the login writes settings and credentials only, and emits no session event or prompt content.

## Known Limitations and Deferred Work

- **The API key is invisible by design** — it is written to the credential store and never returned to the browser, so the dialog can confirm success but cannot show the key. A user who wants the key for another client reads it from the credential source (`.dsh/.env`).
- **One login at a time** — a second start while a flow is polling is refused with a message; concurrent logins from several tabs share the single running flow's settlement.
- **A tab closing during the poll does not cancel it** — the host keeps polling until the flow succeeds or times out, so reopening the dialog shows the same settled outcome rather than restarting.
- **No provider removal** — a pre-existing `baizorai` section keeps fields this patch does not name, but the model list is replaced wholesale by the server's catalog on each successful login.
