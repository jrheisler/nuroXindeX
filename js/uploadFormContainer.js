// Retrieve values from localStorage
var githubUsername = '';
var githubTokenEncoded = '';
var githubToken = '';
var repoOwner = '';
var repoName = '';
var repoPath = '';
var huggingFaceTokenEncoded = '';
var huggingFaceToken = '';


// Base64 encode function (obfuscation)
function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Base64 decode function (deobfuscation)
function base64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

// === Hugging Face summarization ===
async function summarizeText(text) {
    if (!huggingFaceToken) {
        console.warn('Hugging Face token not set; skipping summary');
        return '';
    }
    try {
        // Using Hugging Face's BART model via summarization pipeline
        const response = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${huggingFaceToken}`
            },
            body: JSON.stringify({ inputs: text })
        });
        if (!response.ok) {
            console.error('Summarization API error:', await response.text());
            return '';
        }
        const data = await response.json();
        return Array.isArray(data) && data[0] && data[0].summary_text ? data[0].summary_text : '';
    } catch (err) {
        console.error('Error generating summary:', err);
        return '';
    }
}

async function extractTextFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        text += strings.join(' ') + ' ';
    }
    return text;
}

async function extractTextFromDoc(file) {
    const arrayBuffer = await file.arrayBuffer();
    try {
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } catch (err) {
        console.error('DOC extraction failed:', err);
        return '';
    }
}

async function extractTextFromFile(file) {
    if (file.type === 'application/pdf') {
        return await extractTextFromPdf(file);
    }
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/msword') {
        return await extractTextFromDoc(file);
    }
    return await file.text();
}

// Trigger the enrichment pipeline while reporting stage via statusStream
async function triggerEnrichmentPipeline(file, statusStream) {
    console.log('Triggering enrichment pipeline for file:', file && file.name);
    try {
        if (statusStream) statusStream.set('extracting');
        const text = await extractTextFromFile(file);
        if (statusStream) statusStream.set('summarizing');
        return await summarizeText(text.slice(0, 3000));
    } catch (err) {
        console.error('Enrichment pipeline failed:', err);
        if (statusStream) statusStream.set('');
        return '';
    }
}

function generateSlug(title) {
    const nameWithoutExt = title.replace(/\.[^/.]+$/, '');
    const baseSlug = nameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return baseSlug;
}

async function getUniqueSlug(title) {
    let slug = generateSlug(title);
    let counter = 1;
    let uniqueSlug = slug;
    while (await checkIfFileExists(`${repoPath}/docs/${uniqueSlug}`)) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
    }
    return uniqueSlug;
}

async function createMetadataFile(slug, title, filePath, summary) {
    const metadata = {
        title: title,
        path: filePath,
        summary: summary || "",
    };
    console.log("Creating metadata file with:", metadata);
    const metadataContent = base64Encode(JSON.stringify(metadata, null, 2));
    const metadataFilePath = `${repoPath}/meta/${slug}.json`;

    const existingMeta = await checkIfFileExists(metadataFilePath);

    const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${metadataFilePath}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${githubToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: `Create metadata for ${title}`,
            content: metadataContent,
            ...(existingMeta && { sha: existingMeta.sha })
        })
    });

    const respText = await response.text();
    if (!response.ok) {
        console.error('Error creating metadata file:', response.status, respText);
    } else {
        console.log('Metadata file response:', response.status, respText);
    }
}

async function fetchDocumentIndexFromGitHub() {
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${repoPath}/index.json`, {
    headers: {
      'Authorization': `token ${githubToken}`
    }
  });

  if (!response.ok) {
    console.error("Failed to fetch index.json:", await response.text());
    throw new Error("Unable to fetch document index from GitHub.");
  }

  const result = await response.json();
  const decodedContent = base64Decode(result.content);
  const index = JSON.parse(decodedContent);

  // Enrich each document with its summary from meta files
  const enriched = await Promise.all(index.map(async doc => {
    const metaPath = `${repoPath}/meta/${doc.id}.json`;
    try {
      const metaResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${metaPath}`, {
        headers: {
          'Authorization': `token ${githubToken}`
        }
      });
      if (metaResponse.ok) {
        const metaResult = await metaResponse.json();
        const metaDecoded = base64Decode(metaResult.content);
        const metaData = JSON.parse(metaDecoded);
        doc.summary = metaData.summary || '';
      } else {
        doc.summary = '';
      }
    } catch (err) {
      console.error(`Failed to fetch meta for ${doc.id}:`, err);
      doc.summary = '';
    }
    return doc;
  }));

  return enriched;
}


// Function to get the index file from GitHub repo (to update the document index)
async function fetchDocumentIndex() {
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${repoPath}/index.json`, {
    headers: {
      'Authorization': `token ${githubToken}`,
    }
  });
  const data = await response.json();
  if (data.content) {
    const decodedData = base64Decode(data.content);  // Decoding from base64
    return JSON.parse(decodedData);
  }
  return [];
}

// Function to upload a file to GitHub and get the file URL
// Utilizes XMLHttpRequest so we can hook into progress events
async function uploadFileToGitHub(file, slug, onProgress) {
  const base64Content = await getBase64(file); // Get the Base64 string of the file
  const extension = file.name.slice(file.name.lastIndexOf('.'));
  const filePath = `${repoPath}/docs/${slug}${extension}`;

  try {
    // Check if the file already exists to get the sha for updates
    const fileExists = await checkIfFileExists(filePath);

    let sha = null;
    if (fileExists) {
      // If the file exists, get the current file's sha
      sha = fileExists.sha;
    }

    const payload = JSON.stringify({
      message: `Upload document: ${file.name}`,
      content: base64Content, // Base64 encoded file content
      ...(sha && { sha }) // Add sha for existing files
    });

    // Use XMLHttpRequest to allow progress tracking
    const xhr = new XMLHttpRequest();
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `token ${githubToken}`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total);
        }
      };
    }

    return await new Promise((resolve, reject) => {
      xhr.onerror = () => reject(new Error('Network error while uploading file'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.content.download_url);
          } catch (err) {
            reject(err);
          }
        } else {
          let message = xhr.statusText;
          try {
            const errorData = JSON.parse(xhr.responseText);
            message = errorData.message || message;
          } catch (e) { /* ignore */ }
          console.error("Error uploading file:", message);
          reject(new Error(`GitHub API Error: ${message}`));
        }
      };

      xhr.send(payload);
    });
  } catch (error) {
    console.error("Error in uploadFileToGitHub:", error); // Log the full error
    throw error;
  }
}



// Helper function to convert file to base64
function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]); // Get Base64 without the prefix
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file); // Convert the file to Base64
  });
}



// Function to update the document index (index.json) on GitHub
async function updateDocumentIndex(newDoc) {
  const filePath = `${repoPath}/index.json`;
  let existingIndex = [];
  let sha = null;

  // Step 1: Try to fetch the current index and sha
  try {
    const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
      headers: {
        'Authorization': `token ${githubToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      sha = data.sha; // Required for updating
      const decoded = base64Decode(data.content);
      existingIndex = JSON.parse(decoded);
    }
  } catch (err) {
    console.warn("Could not fetch index.json, will create a new one.");
  }

  // Step 2: Merge or replace entry in index
  const index = existingIndex.findIndex(doc => doc.title === newDoc.title);
  if (index >= 0) {
    existingIndex[index] = newDoc;
  } else {
    existingIndex.push(newDoc);
  }

  // Step 3: Upload updated index
  const updatedContent = base64Encode(JSON.stringify(existingIndex, null, 2));

  const putResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Update index.json with ${newDoc.title}`,
      content: updatedContent,
      ...(sha && { sha }), // Only include sha if updating existing file
    })
  });

  if (!putResponse.ok) {
    const error = await putResponse.json();
    console.error("Error updating index:", error);
    throw new Error("Failed to update index.json");
  }
}

// === Upload toggle button ===
function uploadToggleContainer(showFormStream) {
  return container([
    reactiveButton(new Stream("Upload Document"), () => {
      showFormStream.set(!showFormStream.get());
    }, {
      rounded: true,
      margin: '1rem 0',
      size: '1.1rem'
    })
  ], { align: 'center' ,
    border: '0px'
  });
}

// === Upload form container ===
function uploadFormContainer(documentsStream, showFormStream, knownCategoriesStream, prefillFileStream, themeStream = currentTheme) {
  const titleStream = new Stream('');
  const descriptionStream = new Stream('');
  const docStatusStream = new Stream('');
  const fileStream = new Stream(null);
  const categoryStream = new Stream('');
  const metaStream = new Stream('');

  // Streams for upload progress/status
  const statusStream = new Stream('');
  const progressStream = new Stream(0);
  const isSaving = new Stream(false);
  const saveLabel = derived(isSaving, val => val ? "Saving..." : "Upload and Process");

  fileStream.subscribe(file => {
    if (file) titleStream.set(file.name);
  });

  return conditional(showFormStream, () => {
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

    const modal = document.createElement('div');
    modal.style.padding = '1.5rem';
    modal.style.backgroundColor = '#fff';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
    modal.style.width = '90%';
    modal.style.maxWidth = '500px';
    modal.style.position = 'relative';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '0.5rem';
    closeBtn.style.right = '0.5rem';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', () => {
      showFormStream.set(false);
      fileStream.set(null);
      if (prefillFileStream) prefillFileStream.set(null);
    });
    modal.appendChild(closeBtn);

    // spinner element shown while awaiting operations without progress
    if (!document.getElementById('upload-spinner-style')) {
      const spinnerStyle = document.createElement('style');
      spinnerStyle.id = 'upload-spinner-style';
      spinnerStyle.textContent = `
        @keyframes upload-spinner { to { transform: rotate(360deg); } }
        .upload-spinner {
          width: 24px;
          height: 24px;
          border: 4px solid #ccc;
          border-top-color: #333;
          border-radius: 50%;
          animation: upload-spinner 1s linear infinite;
          margin: 1rem auto;
        }
      `;
      document.head.appendChild(spinnerStyle);
    }

    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'upload-spinner';
    spinnerEl.style.display = 'none';

    // progress bar element (shown during file upload)
    const progressEl = document.createElement('progress');
    progressEl.max = 100;
    progressEl.value = 0;
    progressEl.style.width = '100%';
    progressEl.style.display = 'none';
    progressStream.subscribe(v => progressEl.value = v);

    const updateIndicators = () => {
      const saving = isSaving.get();
      const prog = progressStream.get();
      spinnerEl.style.display = saving && prog === 0 ? 'block' : 'none';
      progressEl.style.display = saving && prog > 0 ? 'block' : 'none';
    };
    isSaving.subscribe(updateIndicators);
    progressStream.subscribe(updateIndicators);

    const fileInputEl = fileInput(fileStream, { margin: '0.5rem 0' }, themeStream);

    if (prefillFileStream) {
      prefillFileStream.subscribe(file => {
        if (file) {
          fileStream.set(file);
          titleStream.set(file.name);
          try {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInputEl.files = dt.files;
          } catch (err) {
            console.warn('Unable to set file input from drop:', err);
          }
        }
      });
    }

    const content = container([
      fileInputEl,
      editText(titleStream, { placeholder: 'Title (required)', margin: '0.5rem 0' }, themeStream),
      editTextArea(descriptionStream, { placeholder: 'Optional description', margin: '0.5rem 0' }, themeStream),
      dropdownStream(docStatusStream, {
        choices: ['draft', 'under review', 'approved', 'final', 'archived'],
        margin: '0.5rem 0'
      }, themeStream),
      editableDropdown(categoryStream, knownCategoriesStream, themeStream),
      editText(metaStream, { placeholder: 'Meta data', margin: '0.5rem 0' }, themeStream),
      reactiveText(statusStream, { margin: '0.5rem 0', size: '0.9rem' }, themeStream),
      spinnerEl,
      progressEl,
      reactiveButton(saveLabel, async () => {
        if (isSaving.get()) return;
        isSaving.set(true);
        statusStream.set('');
        progressStream.set(0);

        const file = fileStream.get();
        if (!file) {
            alert("No file selected");
            isSaving.set(false);
            return;
        }

        const docs = documentsStream.get();
        const existing = docs.find(doc => doc.filename === file.name);

        if (existing) {
          const confirmReplace = await showConfirmationDialog(
            "A document with this file name already exists. Uploading a new version?",
            themeStream // Pass your themeStream
          );
          if (!confirmReplace) {
            isSaving.set(false);
            return;
          }
        }

        const title = titleStream.get().trim();
        if (!title) {
            alert("Title is required.");
            isSaving.set(false);
            return;
        }

        const index = docs.findIndex(doc => doc.filename === file.name);
        const slug = index >= 0 ? docs[index].id : await getUniqueSlug(title);
        const now = new Date().toISOString();

        const newDoc = {
        description: descriptionStream.get(),
        meta: metaStream.get(),
        category: categoryStream.get(),
        title,
        status: docStatusStream.get(),
        filename: file.name,
        createdAt: index >= 0 ? docs[index].createdAt : now,
        lastUpdated: now,
        id: slug,
        summary: ''
        };

        let summary = '';
        try {
          summary = await triggerEnrichmentPipeline(file, statusStream);
          statusStream.set('uploading');
          const fileUrl = await uploadFileToGitHub(file, slug, (loaded, total) => {
            const percent = total ? Math.round((loaded / total) * 100) : 0;
            progressStream.set(percent);
          });
          newDoc.url = fileUrl;

          newDoc.summary = summary;

          const fields = [
            newDoc.title,
            newDoc.description,
            newDoc.meta,
            newDoc.category,
            newDoc.summary
          ];
          newDoc.tokens = Array.from(new Set(tokenize(fields.join(' '))));

          statusStream.set('indexing');
          await createMetadataFile(slug, title, fileUrl, summary);

          await updateDocumentIndex(newDoc);

          if (index >= 0) {
            docs[index] = newDoc;
          } else {
            docs.push(newDoc);
          }

          documentsStream.set([...docs]);
          showFormStream.set(false);
        } catch (err) {
          statusStream.set('');
          alert("Error uploading document: " + err.message);
        } finally {
          isSaving.set(false);
          statusStream.set('');
          progressStream.set(0);
        }
      }, { margin: '0.5rem 0', rounded: true }, themeStream)
    ], {});

    modal.appendChild(content);
    overlay.appendChild(modal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        showFormStream.set(false);
        fileStream.set(null);
        if (prefillFileStream) prefillFileStream.set(null);
      }
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        showFormStream.set(false);
        fileStream.set(null);
        if (prefillFileStream) prefillFileStream.set(null);
      }
    };
    document.addEventListener('keydown', escHandler);

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
