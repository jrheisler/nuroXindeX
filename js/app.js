// === Reactive header title ===
const headerTitleStream = new Stream("Documents");
const expandedCategories = new Stream({});


// === Document grid container ===
function documentListContainer(documentsStream, expandedStream = expandedCategories, themeStream = currentTheme, keys = ['title', 'status', 'meta', 'summary', 'filename', 'lastUpdated', 'download']) {
  return container([
    groupedDocumentCards(documentsStream, expandedStream, themeStream, keys)
  ], { padding: '1rem' });
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
        const decoded = atob(indexData.content);
        const existing = JSON.parse(decoded).filter(d => d.id !== doc.id);
        const updatedContent = btoa(JSON.stringify(existing, null, 2));
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
    await fetchAuthTokens();
    if (!githubToken) {
      console.error('GitHub token not available');
      return;
    }

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

    const userAvatarStream = new Stream('doc.webp');
    const userAvatar = avatarDropdown(
      userAvatarStream,
      { width: '50px', height: '50px', rounded: true },
      currentTheme,
      [
      { label: 'Profile', onClick: () => showToast('Profile clicked') },
      { label: 'Logout', onClick: () => showConfirmationDialog('Are you sure you want to log out?') },
    ]);

    // UI
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

