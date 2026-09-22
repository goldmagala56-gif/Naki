# Everyday Git for Naki

Open a Command Prompt (or Git Bash) in your `naki` folder.

## Save a change and publish it
```
git status
git add .
git commit -m "Short note about what changed"
git push
```
GitHub then runs the tests and, if they pass, publishes the new version. Watch it under the **Actions** tab on GitHub. A green tick means the phone version is live.

## When I send a new zip
1. Unzip it over your `naki` folder and choose **Replace**.
2. Run `git status` to see which files changed.
3. Run the four commands above.

## Useful
- See what changed: `git diff`
- See history: `git log --oneline`
- Undo an edit to one file you have not committed: `git restore path\to\file`
- Never add movies or recordings. They are ignored on purpose.

## Update on the phone
Publishing gives every version its own build id. On the phone, open Naki once with data. It downloads the new version, then shows "Naki was updated". Close it and open it again.
