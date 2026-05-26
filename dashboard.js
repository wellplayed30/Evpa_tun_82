import { auth, db } from './app.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, onSnapshot, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const WORKER_URL = 'https://router-bridge.babichevanya.workers.dev';

let currentUser = null;
let editingDocId = null;

// Элементы формы
const addBtn = document.getElementById('addBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const formTitle = document.getElementById('formTitle');

// Поля формы
const addressField = document.getElementById('address');
const connectionDateField = document.getElementById('connectionDate');
const equipmentIdField = document.getElementById('equipmentId');
const durationField = document.getElementById('duration');
const domainNameField = document.getElementById('domainName');
const costField = document.getElementById('cost');
const routerUsernameField = document.getElementById('routerUsername');
const routerPasswordField = document.getElementById('routerPassword');

// Модальное окно удаления
const deleteModal = document.getElementById('deleteModal');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
let docToDelete = null;

// Модальное окно роутера
const routerModal = document.getElementById('routerModal');
const routerContent = document.getElementById('routerContent');
const closeRouterModal = document.getElementById('closeRouterModal');

// Авторизация
onAuthStateChanged(auth, user => {
  if (!user) window.location.href = 'index.html';
  else {
    currentUser = user;
    document.getElementById('userEmail').textContent = user.email;
    loadSubscriptions();
  }
});

// Выход
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

// Показать/скрыть пароль
document.getElementById('togglePassword').addEventListener('click', () => {
  const type = routerPasswordField.type === 'password' ? 'text' : 'password';
  routerPasswordField.type = type;
});

// Добавление записи
addBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const data = {
    userId: currentUser.uid,
    userEmail: currentUser.email,
    address: addressField.value,
    connectionDate: new Date(connectionDateField.value),
    equipmentId: equipmentIdField.value,
    subscriptionDuration: parseInt(durationField.value),
    domainName: domainNameField.value,
    cost: parseFloat(costField.value),
    routerUsername: routerUsernameField.value,
    routerPassword: routerPasswordField.value,
    notifiedThreeDays: false,
    createdAt: serverTimestamp()
  };
  try {
    await addDoc(collection(db, 'subscriptions'), data);
    clearForm();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
});

// Сохранение изменений
saveBtn.addEventListener('click', async () => {
  if (!editingDocId) return;
  try {
    const docRef = doc(db, 'subscriptions', editingDocId);
    await updateDoc(docRef, {
      address: addressField.value,
      connectionDate: new Date(connectionDateField.value),
      equipmentId: equipmentIdField.value,
      subscriptionDuration: parseInt(durationField.value),
      domainName: domainNameField.value,
      cost: parseFloat(costField.value),
      routerUsername: routerUsernameField.value,
      routerPassword: routerPasswordField.value,
      notifiedThreeDays: false
    });
    cancelEdit();
  } catch (e) {
    alert('Ошибка обновления: ' + e.message);
  }
});

// Отмена редактирования
cancelBtn.addEventListener('click', cancelEdit);

function cancelEdit() {
  editingDocId = null;
  clearForm();
  addBtn.style.display = 'inline-block';
  saveBtn.style.display = 'none';
  cancelBtn.style.display = 'none';
  formTitle.textContent = 'Добавить новую подписку';
}

function clearForm() {
  addressField.value = '';
  connectionDateField.value = '';
  equipmentIdField.value = '';
  durationField.value = '1';
  domainNameField.value = '';
  costField.value = '';
  routerUsernameField.value = '';
  routerPasswordField.value = '';
}

// Модальное окно удаления
cancelDeleteBtn.addEventListener('click', () => {
  deleteModal.classList.remove('active');
  docToDelete = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (!docToDelete) return;
  try {
    await deleteDoc(doc(db, 'subscriptions', docToDelete));
    deleteModal.classList.remove('active');
    docToDelete = null;
  } catch (e) {
    alert('Ошибка удаления: ' + e.message);
  }
});

// Модальное окно роутера
closeRouterModal.addEventListener('click', () => {
  routerModal.classList.remove('active');
});

// Функция для обработки клика по ID оборудования
async function handleEquipmentClick(equipmentId) {
  try {
    await navigator.clipboard.writeText(equipmentId);
  } catch (err) {
    const textArea = document.createElement('textarea');
    textArea.value = equipmentId;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      console.error('Не удалось скопировать');
    }
    document.body.removeChild(textArea);
  }
  
  window.open('https://payberry.ru/pay/26/114#/', '_blank');
}

// Функция запроса данных с роутера (через Worker)
async function fetchRouterData(docId) {
  routerContent.innerHTML = '<p>⏳ Загрузка данных с роутера...</p>';
  routerModal.classList.add('active');
  
  try {
    const response = await fetch(`${WORKER_URL}/?router=${docId}`);
    const data = await response.json();
    
    if (data.error) {
      routerContent.innerHTML = `
        <p style="color: var(--danger);">❌ Ошибка: ${escapeHtml(data.error)}</p>
        ${data.domain ? `<p style="font-size: 0.9em; color: var(--muted);">Домен: ${escapeHtml(data.domain)}</p>` : ''}
      `;
      return;
    }
    
    // Извлекаем данные из ответа
    const result = {};
    if (data.GigabitEthernet1) result.wan = data.GigabitEthernet1;
    if (data.PPTP1) result.vpn = data.PPTP1;
    if (data.version) result.version = data.version;
    if (data.system) result.system = data.system;
    
    displayRouterData(result);
    
  } catch (error) {
    routerContent.innerHTML = `
      <p style="color: var(--danger);">❌ Ошибка соединения: ${escapeHtml(error.message)}</p>
    `;
  }
}

// Функция отображения данных роутера
function displayRouterData(data) {
  let html = '<div style="color: var(--success); margin-bottom: 15px;">✅ Данные получены успешно</div>';
  html += '<div style="width:100%;">';

  // Версия прошивки
  if (data.version) {
    html += `
      <div style="background:#f0fdf4; border-radius:12px; padding:12px 16px; margin-bottom:12px;">
        <span style="font-weight:600;">📦 Версия прошивки:</span>
        <span>${escapeHtml(data.version.title || '—')} (${escapeHtml(data.version.model || '—')})</span>
      </div>`;
  }

  // Системная информация
  if (data.system) {
    const s = data.system;
    const uptimeSec = parseInt(s.uptime) || 0;
    const d = Math.floor(uptimeSec / 86400);
    const h = Math.floor((uptimeSec % 86400) / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    
    html += `
      <div style="background:#f8fafc; border-radius:12px; padding:12px 16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span><span style="font-weight:600;">⏱️ Аптайм:</span> ${d} дн. ${h} ч. ${m} мин.</span>
          <span><span style="font-weight:600;">🔥 CPU:</span> ${s.cpuload || 0}%</span>
        </div>
      </div>`;
  }

  // Интернет (WAN)
  if (data.wan) {
    const w = data.wan;
    const wanUptime = parseInt(w.uptime) || 0;
    const wd = Math.floor(wanUptime / 86400);
    const wh = Math.floor((wanUptime % 86400) / 3600);
    const wm = Math.floor((wanUptime % 3600) / 60);
    
    html += `
      <div style="background:#f0fdf4; border-radius:12px; padding:12px 16px; margin-bottom:12px;">
        <div style="font-weight:600; margin-bottom:8px;">🌐 Интернет (ISP)</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <span>Статус: ${w.link === 'up' ? '🟢 Подключен' : '🔴 Отключен'}</span>
          <span>IP: <strong>${escapeHtml(w.address || '—')}</strong></span>
          <span>Маска: ${escapeHtml(w.mask || '—')}</span>
          <span>Порт: ${w.port?.speed || '—'} Mbps ${w.port?.duplex || ''}</span>
          <span>Время: ${wd} дн. ${wh} ч. ${wm} мин.</span>
        </div>
      </div>`;
  }

  // VPN
  if (data.vpn) {
    const v = data.vpn;
    const vpnUptime = parseInt(v.uptime) || 0;
    const vd = Math.floor(vpnUptime / 86400);
    const vh = Math.floor((vpnUptime % 86400) / 3600);
    const vm = Math.floor((vpnUptime % 3600) / 60);
    
    html += `
      <div style="background:#fef3c7; border-radius:12px; padding:12px 16px; margin-bottom:12px;">
        <div style="font-weight:600; margin-bottom:8px;">🔒 VPN (${escapeHtml(v.description || 'PPTP')})</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <span>Статус: ${v.link === 'up' ? '🟢 Подключен' : '🔴 Отключен'}</span>
          <span>IP: <strong>${escapeHtml(v.address || '—')}</strong></span>
          <span>Сервер: ${escapeHtml(v['remote-endpoint-address'] || '—')}</span>
          <span>Время: ${vd} дн. ${vh} ч. ${vm} мин.</span>
        </div>
      </div>`;
  }

  html += '</div>';
  routerContent.innerHTML = html;
}

// Загрузка и отображение таблицы
function loadSubscriptions() {
  const q = query(collection(db, 'subscriptions'), where('userId', '==', currentUser.uid));
  onSnapshot(q, snapshot => {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-message">Нет добавленных подписок</td></tr>';
      return;
    }
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      const endDate = new Date(d.connectionDate.toDate());
      endDate.setMonth(endDate.getMonth() + d.subscriptionDuration);

      let domainLink = d.domainName;
      if (d.domainName && !d.domainName.startsWith('http')) {
        domainLink = 'http://' + d.domainName;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(d.address)}</td>
        <td>${d.connectionDate.toDate().toLocaleDateString()}</td>
        <td><a href="#" class="payberry-link" data-id="${escapeHtml(d.equipmentId)}" title="Скопировать ID и открыть Payberry">${escapeHtml(d.equipmentId)}</a></td>
        <td>${d.subscriptionDuration} мес.</td>
        <td>${d.domainName ? `<a href="${domainLink}" target="_blank">${escapeHtml(d.domainName)}</a>` : '—'}</td>
        <td>${d.cost ? d.cost.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
        <td>${endDate.toLocaleDateString()}</td>
        <td>
          ${d.routerUsername ? `<span class="created-by">🔑 ${escapeHtml(d.routerUsername)}</span>` : '—'}
          ${d.routerPassword ? '<span class="created-by">🔒 ••••••••</span>' : ''}
        </td>
        <td><span class="created-by">${escapeHtml(d.userEmail || '—')}</span></td>
        <td>
          <div class="action-btns">
            ${d.domainName && d.routerUsername && d.routerPassword ? 
              `<button class="btn-icon btn-router" data-id="${docSnap.id}" title="Данные роутера">📡</button>` : ''}
            <button class="btn-icon btn-edit" data-id="${docSnap.id}" title="Редактировать">✏️</button>
            <button class="btn-icon btn-delete" data-id="${docSnap.id}" title="Удалить">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Обработчики для Payberry-ссылок
    document.querySelectorAll('.payberry-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const equipmentId = e.target.closest('a').dataset.id;
        handleEquipmentClick(equipmentId);
      });
    });

    // Обработчики для кнопок роутера
    document.querySelectorAll('.btn-router').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const docId = e.target.closest('button').dataset.id;
        fetchRouterData(docId);
      });
    });

    // Обработчики для кнопок редактирования
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const docId = e.target.closest('button').dataset.id;
        startEdit(docId);
      });
    });

    // Обработчики для кнопок удаления
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const docId = e.target.closest('button').dataset.id;
        openDeleteModal(docId);
      });
    });
  });
}

function startEdit(docId) {
  const q = query(collection(db, 'subscriptions'), where('userId', '==', currentUser.uid));
  onSnapshot(q, snapshot => {
    snapshot.forEach(docSnap => {
      if (docSnap.id === docId) {
        const d = docSnap.data();
        editingDocId = docId;
        addressField.value = d.address || '';
        connectionDateField.value = d.connectionDate.toDate().toISOString().split('T')[0];
        equipmentIdField.value = d.equipmentId || '';
        durationField.value = d.subscriptionDuration || 1;
        domainNameField.value = d.domainName || '';
        costField.value = d.cost || '';
        routerUsernameField.value = d.routerUsername || '';
        routerPasswordField.value = d.routerPassword || '';
        
        addBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        formTitle.textContent = '✏️ Редактировать подписку';
        
        document.getElementById('formCard').scrollIntoView({ behavior: 'smooth' });
      }
    });
  }, { includeMetadataChanges: false });
}

function openDeleteModal(docId) {
  docToDelete = docId;
  deleteModal.classList.add('active');
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
