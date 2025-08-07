// === Reactive header title ===
const headerTitleStream = new Stream("Documents");
const expandedCategories = new Stream({});

// === Document grid container ===
function documentListContainer(documentsStream, expandedStream = expandedCategories, themeStream = currentTheme, keys = ['title', 'status', 'meta', 'summary', 'filename', 'lastUpdated', 'download']) {
  return container([
    groupedDocumentCards(documentsStream, expandedStream, themeStream, keys)
  ], { padding: '1rem' });
}

function settingsModal(showModalStream, themeStream = currentTheme) {
  // Retrieve the current values from localStorage or set default values
  const storedGithubUsername = localStorage.getItem('githubUsername') || '';
  const storedGithubTokenEncoded = localStorage.getItem('githubToken') || '';
  const storedRepoOwner = localStorage.getItem('repoOwner') || '';
  const storedRepoName = localStorage.getItem('repoName') || '';
  const storedRepoPath = localStorage.getItem('repoPath') || '';
  const storedHuggingFaceTokenEncoded = localStorage.getItem('huggingFaceToken') || '';

  // Streams for form data with initial values
  const githubUsernameStream = new Stream(storedGithubUsername);
  const githubTokenStream = new Stream(base64Decode(storedGithubTokenEncoded));  // Decode token to display in the form
  const repoOwnerStream = new Stream(storedRepoOwner);
  const repoNameStream = new Stream(storedRepoName);
  const repoPathStream = new Stream(storedRepoPath);
  const huggingFaceTokenStream = new Stream(base64Decode(storedHuggingFaceTokenEncoded));

  return conditional(showModalStream, () => {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '1000';

    // Create modal container
    const modal = document.createElement('div');
    modal.style.padding = '1.5rem';
    modal.style.backgroundColor = '#fff';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
    modal.style.width = '90%';
    modal.style.maxWidth = '500px';
    modal.style.position = 'relative';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '0.5rem';
    closeBtn.style.right = '0.5rem';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', () => showModalStream.set(false));
    modal.appendChild(closeBtn);

    // Create form inputs
    const content = container([
      editText(githubUsernameStream, { placeholder: 'GitHub Username', margin: '0.5rem 0' }, themeStream),
      editText(githubTokenStream, { placeholder: 'GitHub Token', margin: '0.5rem 0', type: 'password' }, themeStream),
      editText(repoOwnerStream, { placeholder: 'Repository Owner', margin: '0.5rem 0' }, themeStream),
      editText(repoNameStream, { placeholder: 'Repository Name', margin: '0.5rem 0' }, themeStream),
      editText(repoPathStream, { placeholder: 'Repository Path', margin: '0.5rem 0' }, themeStream),
      editText(huggingFaceTokenStream, { placeholder: 'Hugging Face Token', margin: '0.5rem 0', type: 'password' }, themeStream),
      (() => {
        const isSaving = new Stream(false);
        const saveLabel = derived(isSaving, val => val ? "Saving..." : "Save");

        return reactiveButton(saveLabel, async () => {
          if (isSaving.get()) return;
          isSaving.set(true);

          // Update global variables with current form values
          githubUsername = githubUsernameStream.get();
          githubToken = githubTokenStream.get();
          repoOwner = repoOwnerStream.get();
          repoName = repoNameStream.get();
          repoPath = repoPathStream.get();
          huggingFaceToken = huggingFaceTokenStream.get();

          // Encode tokens before saving to localStorage
          githubTokenEncoded = base64Encode(githubToken);
          huggingFaceTokenEncoded = base64Encode(huggingFaceToken);

          // Persist settings
          localStorage.setItem('githubUsername', githubUsername);
          localStorage.setItem('githubToken', githubTokenEncoded);
          localStorage.setItem('repoOwner', repoOwner);
          localStorage.setItem('repoName', repoName);
          localStorage.setItem('repoPath', repoPath);
          localStorage.setItem('huggingFaceToken', huggingFaceTokenEncoded);

          // Ensure repository directories exist for new settings
          try {
            await ensureDirectoriesExist();
          } catch (err) {
            console.error('Failed to ensure directories:', err);
          }

          // Close modal after saving
          showModalStream.set(false);
          isSaving.set(false);
        }, { margin: '0.5rem 0', rounded: true }, themeStream);
      })()
    ], {});

    modal.appendChild(content);
    overlay.appendChild(modal);

    // Close modal when clicking outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) showModalStream.set(false);
    });

    // Close modal when pressing Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') showModalStream.set(false);
    };
    document.addEventListener('keydown', escHandler);

    // Cleanup event listeners when modal is removed
    const observer = new MutationObserver(() => {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', escHandler);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return overlay;
  });
}

// Function to check if the file already exists in the GitHub repository
async function checkIfFileExists(filePath) {
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
    method: 'GET',
    headers: {
      'Authorization': `token ${githubToken}`,
    }
  });

  if (response.ok) {
    const data = await response.json();
    return data; // File exists, return file data including sha
  } else if (response.status === 404) {
    return null; // File doesn't exist
  } else {
    const errorData = await response.json();
    console.error("Error checking file:", errorData);
    throw new Error("Error checking file existence");
  }
}

async function ensureDirectoriesExist() {
    if (!githubToken) {
        throw new Error("GitHub token not found. Please set it in the settings.");
    }
    const dirs = ['docs', 'meta'];
    for (const dir of dirs) {
        const path = `${repoPath}/${dir}/.gitkeep`;
        const fileExists = await checkIfFileExists(path);
        if (!fileExists) {
            console.log(`Directory ${dir} does not exist. Creating...`);
            const emptyContent = btoa('');
            await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `Create ${dir} directory`,
                    content: emptyContent,
                })
            });
        }
    }
}

// Remove a document, its metadata, and update index.json on GitHub
async function deleteDocument(doc) {
  if (!githubToken) {
    alert('GitHub token not found. Please set it in the settings.');
    return;
  }

  const confirmed = await showConfirmationDialog(`Delete "${doc.filename}"?`, currentTheme);
  if (!confirmed) return;

  try {
    const extension = doc.filename.slice(doc.filename.lastIndexOf('.'));
    const filePath = `${repoPath}/docs/${doc.id}${extension}`;
    const fileData = await checkIfFileExists(filePath);
    if (fileData) {
      await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Delete ${doc.filename}`,
          sha: fileData.sha,
        }),
      });
    }

    const metaPath = `${repoPath}/meta/${doc.id}.json`;
    const metaData = await checkIfFileExists(metaPath);
    if (metaData) {
      await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${metaPath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Delete metadata for ${doc.id}`,
          sha: metaData.sha,
        }),
      });
    }

    const indexPath = `${repoPath}/index.json`;
    const indexRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${indexPath}`, {
      headers: { 'Authorization': `token ${githubToken}` },
    });
    if (indexRes.ok) {
      const indexData = await indexRes.json();
      const indexSha = indexData.sha;
      const decoded = base64Decode(indexData.content);
      const existing = JSON.parse(decoded).filter(d => d.id !== doc.id);
      const updatedContent = base64Encode(JSON.stringify(existing, null, 2));
      await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${indexPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Remove ${doc.filename} from index`,
          content: updatedContent,
          sha: indexSha,
        }),
      });
      if (window.documentsStream) {
        const current = window.documentsStream.get().filter(d => d.id !== doc.id);
        window.documentsStream.set(current);
      }
    }
  } catch (err) {
    console.error('Error deleting document:', err);
    alert('Failed to delete document.');
  }
}

// === App entry ===
document.addEventListener('DOMContentLoaded', async () => {
  // Retrieve values from localStorage
  githubUsername = localStorage.getItem('githubUsername');
  githubTokenEncoded = localStorage.getItem('githubToken');
  repoOwner = localStorage.getItem('repoOwner');
  repoName = localStorage.getItem('repoName');
  repoPath = localStorage.getItem('repoPath');
  huggingFaceTokenEncoded = localStorage.getItem('huggingFaceToken');

  githubToken = base64Decode(githubTokenEncoded);
  huggingFaceToken = base64Decode(huggingFaceTokenEncoded || '');

  await ensureDirectoriesExist();


  // Apply theme
  currentTheme.subscribe(theme => applyThemeToPage(theme));

  // Streams
  const documentsStream = new Stream([]);
  window.documentsStream = documentsStream;
  const showFormStream = new Stream(false);
  const knownCategoriesStream = derived(documentsStream, docs => {
    const set = new Set(docs.map(doc => doc.category?.trim()).filter(Boolean));
    return Array.from(set).sort();
  });

  // 🟡 Fetch index.json and hydrate the stream
  try {
    const indexData = await fetchDocumentIndexFromGitHub();
    documentsStream.set(indexData); // Hydrate the grid with document metadata
  } catch (err) {
    console.warn("Using empty index as fallback.");
    documentsStream.set([]); // Fallback: start with empty list
  }

  const showModalStream = new Stream(false);
  const userAvatarStream = new Stream('doc.webp');
  const userAvatar = avatarDropdown(
    userAvatarStream,
    { width: '50px', height: '50px', rounded: true },
    currentTheme,
    [
    { label: 'Profile', onClick: () => showToast('Profile clicked') },
    { 
  label: 'Settings', 
      onClick: () => {
        showModalStream.set(true);        
      }
    },
    { label: 'Logout', onClick: () => showConfirmationDialog('Are you sure you want to log out?') },
  ]);

  // UI
  document.body.appendChild(settingsModal(showModalStream, currentTheme));
 

  document.body.appendChild(
    uploadFormContainer(documentsStream, showFormStream, knownCategoriesStream)
  );

  document.body.appendChild(
    column([
      container(
        row([
          userAvatar,          
          reactiveButton(new Stream("Upload Document"), () => {
            showFormStream.set(true);
          }, {
            rounded: true,
            margin: '1rem 0',
            size: '1.1rem'
          }),
          themedThemeSelector()
        ])
      ),
      documentListContainer(documentsStream, expandedCategories, currentTheme, ['title', 'status', 'meta', 'summary', 'filename', 'lastUpdated', 'download'])
    ])
  );

});

