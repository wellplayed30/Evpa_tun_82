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
    result.ports = {};
    if (data['1']) result.ports.port1 = data['1'];
    if (data['2']) result.ports.port2 = data['2'];
    if (data['3']) result.ports.port3 = data['3'];
    
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
  html += '<table style="width:100%; border-collapse: collapse;">';
  html += '<tr style="background:#f8fafc;"><th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0;">Параметр</th><th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0;">Значение</th></tr>';

  // Интернет (WAN)
  if (data.wan) {
    const w = data.wan;
    const wanUptime = parseInt(w.uptime) || 0;
    const wd = Math.floor(wanUptime / 86400);
    const wh = Math.floor((wanUptime % 86400) / 3600);
    const wm = Math.floor((wanUptime % 3600) / 60);
    
    html += `<tr style="background:#f0fdf4;"><td colspan="2" style="padding:10px; font-weight:600;">🌐 Интернет (ISP)</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Статус</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${w.link === 'up' ? '🟢 Подключен' : '🔴 Отключен'}</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">IP-адрес</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(w.address || '—')}</strong></td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Маска</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${escapeHtml(w.mask || '—')}</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Скорость порта</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${w.port?.speed || '—'} Mbps ${w.port?.duplex || ''}</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Время подключения</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${wd} дн. ${wh} ч. ${wm} мин.</td></tr>`;
  }

  // Ethernet порты
  if (data.ports && Object.keys(data.ports).length > 0) {
    html += `<tr style="background:#eff6ff;"><td colspan="2" style="padding:10px; font-weight:600;">🔌 Ethernet порты</td></tr>`;
    
    ['port1', 'port2', 'port3'].forEach((portKey, i) => {
      const port = data.ports[portKey];
      if (port) {
        html += `<tr>
          <td style="padding:8px; border-bottom:1px solid #e2e8f0;">Порт ${i + 1}</td>
          <td style="padding:8px; border-bottom:1px solid #e2e8f0;">
            ${port.link === 'up' ? `🟢 Подключен (${port.speed} Mbps ${port.duplex})` : '🔴 Отключен'}
          </td>
        </tr>`;
      }
    });
  }

  // VPN
  if (data.vpn) {
    const v = data.vpn;
    const vpnUptime = parseInt(v.uptime) || 0;
    const vd = Math.floor(vpnUptime / 86400);
    const vh = Math.floor((vpnUptime % 86400) / 3600);
    const vm = Math.floor((vpnUptime % 3600) / 60);
    
    html += `<tr style="background:#fef3c7;"><td colspan="2" style="padding:10px; font-weight:600;">🔒 VPN (${escapeHtml(v.description || 'PPTP')})</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Статус</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${v.link === 'up' ? '🟢 Подключен' : '🔴 Отключен'}</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">VPN IP</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(v.address || '—')}</strong></td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Сервер</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${escapeHtml(v['remote-endpoint-address'] || '—')}</td></tr>`;
    html += `<tr><td style="padding:8px; border-bottom:1px solid #e2e8f0;">Время работы</td><td style="padding:8px; border-bottom:1px solid #e2e8f0;">${vd} дн. ${vh} ч. ${vm} мин.</td></tr>`;
  }

  html += '</table>';
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
