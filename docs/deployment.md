# GitHub Actions and Cloudflare Pages deployment

The repository uses GitHub Actions to check the source, build the static application, and upload only verified `dist` output to a Cloudflare Pages Direct Upload project. Production follows `main`; pull requests run checks without Cloudflare credentials or production deployment.

The workflow is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). The application is in the documentation stage: repository checks run now, while application checks and deployment activate when `package.json`, `package-lock.json`, and `index.html` are present. An incomplete scaffold fails instead of silently skipping required files.

## 1. Cloudflare credentials

Create a custom API token in your Cloudflare account with this permission and resource scope:

| Setting | Value |
| --- | --- |
| Token name | `baby-type-game-github-actions` |
| Permission | Account / Cloudflare Pages / Edit |
| Account resource | Include only the account that will host this game |
| Zone permissions | None required for the Pages deployment |

In the Cloudflare dashboard, open Workers & Pages and copy Account ID from Account Details. Alternatively, use dashboard Search and enter `Copy account ID`. The account ID has 32 characters; a zone ID is not the account ID, and a domain purchase is not required to start with Pages.

The token allows CI to create the Pages project and upload deployments in the selected account. Do not use the Global API Key. See [Cloudflare's Direct Upload CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) and [finding an account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

## 2. GitHub repository secrets

Open [repository Actions secrets](https://github.com/zerob13/baby-type-game/settings/secrets/actions). Add these as **repository secrets**, not variables or files:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The selected Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | The custom token with Pages Edit permission |

Enter the values directly into GitHub. Do not paste them into an issue, pull request, chat, screenshot, source file, or commit. The workflow passes them only to configuration checks and deployment commands; it never prints their values.

No additional GitHub personal access token is required. The workflow uses GitHub's read-only built-in permissions for checkout and artifacts.

## 3. Create the Pages project once

The CI can create an empty Direct Upload project before the game application exists:

1. Open [the CI and Cloudflare Pages workflow](https://github.com/zerob13/baby-type-game/actions/workflows/ci.yml).
2. Select **Run workflow**, choose the `main` branch, and enable **Create the Cloudflare Pages project once before its first deployment**.
3. Run it after saving both secrets. It will check the repository, authenticate, and create `baby-type-game` with production branch `main`.
4. Confirm that the project appears under Workers & Pages in the intended Cloudflare account. Without application code, the workflow creates the project but does not deploy a fake game or the repository's documents.

Do this only once. If the project already exists, leave the checkbox disabled. A duplicate-create error means the creation request should not be repeated; it is not a reason to delete an existing project.

If you already created a Git-integrated Pages project, do not also enable its automatic Git builds. Use one production deployment mechanism, or choose a separate Direct Upload project. The workflow owns the production build and deploy sequence.

The project name is `baby-type-game` in both Wrangler commands in the workflow. If that name cannot be used in your account, update both commands consistently before creating or deploying it. The Pages dashboard supplies the actual site address.

Project creation uses `wrangler pages project create baby-type-game --production-branch=main`; see [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

## 4. Automatic production deployment

Once the application scaffold and required npm scripts exist, each push to `main` follows this sequence:

```text
main push
   |
   v
Repository checks -> npm ci -> typecheck -> tests -> build -> output checks
                                                                 |
                                                                 v
                                                     Upload verified dist
                                                                 |
                                               Separate deployment job
                                                                 |
                                                                 v
                                                Cloudflare Pages production
```

The required scripts are `typecheck`, `test`, and `build`. Missing scripts fail the build; tests must exit rather than start watch mode. Builds must produce `dist/index.html`.

The deploy job downloads the artifact produced by that same workflow run. It does not rebuild the game with Cloudflare credentials, execute pull-request code, or upload the repository root. `main` runs are serialized to keep older builds from finishing deployment after newer ones; superseded pull-request checks may be canceled.

Deployment uses pinned Wrangler `4.151.1` with an explicit project name, production branch, and source commit hash. Third-party Actions are pinned to full commit hashes. Review the corresponding workflow references when upgrading them.

The Pages project needs no separate build command, output-directory setting, database, or Worker. Those responsibilities live in GitHub Actions. Once a production deployment exists, add a custom domain through that Pages project's Custom domains settings if desired.

## 5. Repository and asset privacy

The owner's approved public Git identity is `zerob13 <i@zerob13.com>`. GitHub noreply identities and GitHub's merge identity are also accepted by the repository checks. Other personal email addresses are rejected rather than printed.

Configure this repository locally:

```sh
git config --local user.name zerob13
git config --local user.email i@zerob13.com
git config --local core.hooksPath .githooks
```

The pre-push hook checks the history being pushed and tracked working files. CI repeats those checks on `main` and pull requests. The guard detects known token forms, private-key headers, literal credential assignments, local user-directory paths, unapproved email addresses, private configuration/export filenames, and PNG text, EXIF, and provenance metadata. Findings contain only file/commit references and categories, never matched secret values.

GitHub secret scanning and push protection supplement this targeted guard. Image pixel data is unaffected by metadata removal; runtime art can be exported without embedded author, machine, or generation metadata. Before publishing another binary format, check its metadata separately because the PNG guard does not inspect every binary format.

Keep credentials in GitHub Secrets. `.env`, `.dev.vars`, `.wrangler`, local package credentials, private-key files, and exported game saves are ignored. Only non-secret examples belong in `.env.example`.

All values embedded in a browser bundle, including Vite's `VITE_*` variables, are public to visitors. Do not put a Cloudflare token, account credentials, private documents, or local storage exports in client-side variables or `dist`. The output check rejects public source maps and sensitive file patterns. See [Vite's environment-variable guidance](https://vite.dev/guide/env-and-mode).

## 6. Verification and troubleshooting

| Result | Meaning and action |
| --- | --- |
| Repository checks pass; build/deploy skipped | The current commit has no game scaffold. This is expected for documentation-only work. |
| Invalid account ID | Save the account ID, not a zone ID or account name, in `CLOUDFLARE_ACCOUNT_ID`. |
| Missing token | Save `CLOUDFLARE_API_TOKEN` as a repository Actions secret. |
| Cloudflare authentication failure | Check token validity, Pages Edit permission, selected account, and token expiration. |
| Project creation says it already exists | Leave the creation checkbox off; do not delete the existing project. |
| Project not found on deployment | Confirm account/project name and run the creation step once if no project exists. |
| Build or tests fail | Fix the application checks. Deployment runs only after they pass. |
| Privacy guard fails | Inspect the named file/category locally; do not publish the matched value to investigate it. |
| No saved progress on a new domain | Browser saves are origin-specific. Export from the previous origin and import on the new one. |

After the first game deployment, verify the actual Pages address, asset loading, complete game loop, refresh/resume, and import/export. A passing documentation check or successful project creation is not a completed end-to-end game deployment.
