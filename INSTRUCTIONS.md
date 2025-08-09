# How to run this project locally

The app now fetches GitHub and Hugging Face credentials from a small backend service. Opening `index.html` directly from the file system will fail because the `/api/tokens` endpoint is unavailable.

## Start the local server

1. Ensure [Node.js](https://nodejs.org/) is installed.
2. In a terminal, navigate to the project root.
3. Provide your tokens via environment variables and start the server:

   ```bash
   export GITHUB_USERNAME="your-username"
   export GITHUB_TOKEN="ghp_example"
   export REPO_OWNER="repo-owner"
   export REPO_NAME="repo-name"
   export REPO_PATH="path/in/repo"
   export HUGGING_FACE_TOKEN="hf_example"
   node server.js
   ```

   On Windows PowerShell use `$env:GITHUB_TOKEN="value"` etc. instead of `export`.

4. Open a browser and navigate to [http://localhost:8000](http://localhost:8000).

The frontend will request the credentials from `/api/tokens`, so the page must be served through this server.
