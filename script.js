const ONE_TB = 1024 * 1024 * 1024 * 1024;
const DB_NAME = "freebox_storage_db";
const DB_VERSION = 1;
const USERS_KEY = "freebox_users";
const SESSION_KEY = "freebox_active_user";

let db;
let currentUser = null;
let cachedFiles = [];

const elements = {
  guestNav: document.getElementById("guestNav"),
  userNav: document.getElementById("userNav"),
  activeUser: document.getElementById("activeUser"),
  logoutBtn: document.getElementById("logoutBtn"),
  authPage: document.getElementById("authPage"),
  dashboardPage: document.getElementById("dashboardPage"),
  loginTab: document.getElementById("loginTab"),
  registerTab: document.getElementById("registerTab"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  authMessage: document.getElementById("authMessage"),
  uploadMessage: document.getElementById("uploadMessage"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  fileList: document.getElementById("fileList"),
  searchInput: document.getElementById("searchInput"),
  refreshBtn: document.getElementById("refreshBtn"),
  storageBar: document.getElementById("storageBar"),
  usedStorage: document.getElementById("usedStorage"),
  freeStorage: document.getElementById("freeStorage")
};

document.addEventListener("DOMContentLoaded", async () => {
  db = await openDatabase();
  currentUser = getActiveUser();
  bindEvents();
  renderApp();
});

function bindEvents() {
  elements.loginTab.addEventListener("click", () => switchAuthTab("login"));
  elements.registerTab.addEventListener("click", () => switchAuthTab("register"));
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.logoutBtn.addEventListener("click", logout);
  elements.fileInput.addEventListener("change", event => uploadFiles(event.target.files));
  elements.refreshBtn.addEventListener("click", loadUserFiles);
  elements.searchInput.addEventListener("input", renderFiles);

  ["dragenter", "dragover"].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      elements.dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragover");
    });
  });

  elements.dropZone.addEventListener("drop", event => {
    uploadFiles(event.dataTransfer.files);
  });
}

function switchAuthTab(tab) {
  const isLogin = tab === "login";
  elements.loginTab.classList.toggle("active", isLogin);
  elements.registerTab.classList.toggle("active", !isLogin);
  elements.loginForm.classList.toggle("hidden", !isLogin);
  elements.registerForm.classList.toggle("hidden", isLogin);
  hideMessage(elements.authMessage);
}

async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim().toLowerCase();
  const password = document.getElementById("registerPassword").value;

  const users = getUsers();
  const userExists = users.some(user => user.email === email);

  if (userExists) {
    showMessage(elements.authMessage, "Email sudah terdaftar. Silakan login.", "error");
    return;
  }

  const passwordHash = await sha256(password);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    quota: ONE_TB,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveUsers(users);
  elements.registerForm.reset();
  switchAuthTab("login");
  showMessage(elements.authMessage, "Akun berhasil dibuat. Silakan login.", "success");
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;
  const passwordHash = await sha256(password);
  const users = getUsers();
  const user = users.find(item => item.email === email && item.passwordHash === passwordHash);

  if (!user) {
    showMessage(elements.authMessage, "Email atau password salah.", "error");
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, email: user.email }));
  currentUser = user;
  elements.loginForm.reset();
  renderApp();
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  cachedFiles = [];
  hideMessage(elements.uploadMessage);
  renderApp();
}

function renderApp() {
  if (currentUser) {
    elements.guestNav.classList.add("hidden");
    elements.userNav.classList.remove("hidden");
    elements.activeUser.textContent = `${currentUser.name} • ${currentUser.email}`;
    elements.authPage.classList.add("hidden");
    elements.dashboardPage.classList.remove("hidden");
    loadUserFiles();
  } else {
    elements.guestNav.classList.remove("hidden");
    elements.userNav.classList.add("hidden");
    elements.authPage.classList.remove("hidden");
    elements.dashboardPage.classList.add("hidden");
  }
}

async function uploadFiles(fileList) {
  if (!currentUser) return;

  const files = Array.from(fileList);
  if (!files.length) return;

  const usedBefore = cachedFiles.reduce((total, file) => total + file.size, 0);
  const incomingSize = files.reduce((total, file) => total + file.size, 0);

  if (usedBefore + incomingSize > ONE_TB) {
    showMessage(elements.uploadMessage, "Upload gagal. Total file melebihi batas kuota 1TB.", "error");
    return;
  }

  try {
    for (const file of files) {
      await addFileToDatabase({
        id: crypto.randomUUID(),
        userId: currentUser.id,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        uploadedAt: new Date().toISOString(),
        blob: file
      });
    }

    elements.fileInput.value = "";
    showMessage(elements.uploadMessage, `${files.length} file berhasil diupload.`, "success");
    await loadUserFiles();
  } catch (error) {
    showMessage(elements.uploadMessage, "Upload gagal. Browser mungkin membatasi kapasitas penyimpanan lokal.", "error");
    console.error(error);
  }
}

async function loadUserFiles() {
  if (!currentUser) return;
  cachedFiles = await getFilesByUser(currentUser.id);
  cachedFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  updateStorageInfo();
  renderFiles();
}

function renderFiles() {
  const keyword = elements.searchInput.value.trim().toLowerCase();
  const files = cachedFiles.filter(file => file.name.toLowerCase().includes(keyword));

  if (!files.length) {
    elements.fileList.innerHTML = `
      <div class="empty-state">
        <h3>Belum ada file</h3>
        <p>Upload file pertama kamu agar muncul di sini.</p>
      </div>
    `;
    return;
  }

  elements.fileList.innerHTML = files.map(file => `
    <div class="file-card">
      <div class="file-icon">${getFileIcon(file.name, file.type)}</div>
      <div>
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-meta">
          ${formatBytes(file.size)} • ${escapeHtml(file.type)}<br />
          Diupload: ${formatDate(file.uploadedAt)}
        </div>
      </div>
      <div class="file-actions">
        <button onclick="downloadFile('${file.id}')">Download</button>
        <button class="secondary" onclick="renameFile('${file.id}')">Rename</button>
        <button class="danger" onclick="deleteFile('${file.id}')">Hapus</button>
      </div>
    </div>
  `).join("");
}

async function downloadFile(fileId) {
  const file = await getFileById(fileId);
  if (!file || file.userId !== currentUser.id) return;

  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function renameFile(fileId) {
  const file = await getFileById(fileId);
  if (!file || file.userId !== currentUser.id) return;

  const newName = prompt("Masukkan nama file baru:", file.name);
  if (!newName || !newName.trim()) return;

  file.name = newName.trim();
  await updateFileInDatabase(file);
  await loadUserFiles();
}

async function deleteFile(fileId) {
  const confirmed = confirm("Yakin ingin menghapus file ini?");
  if (!confirmed) return;

  const file = await getFileById(fileId);
  if (!file || file.userId !== currentUser.id) return;

  await deleteFileFromDatabase(fileId);
  await loadUserFiles();
}

function updateStorageInfo() {
  const used = cachedFiles.reduce((total, file) => total + file.size, 0);
  const free = Math.max(ONE_TB - used, 0);
  const percent = Math.min((used / ONE_TB) * 100, 100);

  elements.storageBar.style.width = `${percent}%`;
  elements.usedStorage.textContent = `Terpakai: ${formatBytes(used)}`;
  elements.freeStorage.textContent = `Sisa: ${formatBytes(free)}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("files")) {
        const store = database.createObjectStore("files", { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("uploadedAt", "uploadedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function addFileToDatabase(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.add(fileRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function updateFileInDatabase(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.put(fileRecord);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getFileById(fileId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const request = store.get(fileId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getFilesByUser(userId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const index = store.index("userId");
    const request = index.getAll(userId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function deleteFileFromDatabase(fileId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.delete(fileId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getActiveUser() {
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  if (!session) return null;
  const users = getUsers();
  return users.find(user => user.id === session.id) || null;
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type || ""}`;
  element.classList.remove("hidden");
}

function hideMessage(element) {
  element.classList.add("hidden");
  element.textContent = "";
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateString));
}

function getFileIcon(name, type) {
  const lowerName = name.toLowerCase();
  if (type.startsWith("image/")) return "🖼️";
  if (type.startsWith("video/")) return "🎬";
  if (type.startsWith("audio/")) return "🎵";
  if (lowerName.endsWith(".pdf")) return "📕";
  if (lowerName.endsWith(".zip") || lowerName.endsWith(".rar") || lowerName.endsWith(".7z")) return "🗜️";
  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) return "📄";
  if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) return "📊";
  return "📦";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
