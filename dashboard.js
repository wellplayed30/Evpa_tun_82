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
const categoryField = document.getElementById('category');
const connectionDateField = document.getElementById('connectionDate');
const equipmentIdField = document.getElementById('equipmentId');
const durationField = document.getElementById('duration');
const domainNameField = document.getElementById('domainName');
const costField = document.getElementById('cost');
const routerUsernameField = document.getElementById('routerUsername');
const routerPasswordField = document.getElementById('routerPassword');

// Группы полей для скрытия
const clientOnlyFields = document.querySelectorAll('.client-only');

// Модальное окно удаления
const deleteModal = document.getElementById('deleteModal');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
let docToDelete = null;

// Модальное окно роутера
const routerModal = document.getElementById('routerModal');
const routerContent = document.getElementById('routerContent');
const closeRouterModal = document.getElementById('closeRouterModal');

// Переключение видимости полей при смене категории
categoryField.addEventListener('change', () => {
  const isClient = categoryField.value === 'clients';
  clientOnlyFields.forEach(el => el.style.display = isClient ? '' : 'none');
});

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
  
  const category = categoryField.value;
  
  const data = {
    userId: currentUser.uid,
    userEmail: currentUser.email,
    category: category,
    address: addressField.value,
    equipmentId: equipmentIdField.value,
    domainName: domainNameField.value,
    routerUsername: routerUsernameField.value,
    routerPassword: routerPasswordField.value,
    notifiedThreeDays: false,
    createdAt: serverTimestamp()
  };
  
  // Добавляем поля только для клиентов
  if (category === 'clients') {
    data.connectionDate = new Date(connectionDateField.value);
    data.subscriptionDuration = parseInt(durationField.value);
    data.cost = parseFloat(costField.value);
  }
  
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
  
  const category = categoryField.value;
  
  const updateData = {
    category: category,
    address: addressField.value,
    equipmentId: equipmentIdField.value,
    domainName: domainNameField.value,
    routerUsername: routerUsernameField.value,
    routerPassword: routerPasswordField.value,
    notifiedThreeDays: false
  };
  
  // Обновляем поля только для клиентов
  if (category === 'clients') {
    updateData.connectionDate = new Date(connectionDateField.value);
    updateData.subscriptionDuration = parseInt(durationField.value);
    updateData.cost = parseFloat(costField.value);
  } else {
    updateData.connectionDate = null;
    updateData.subscriptionDuration = null;
    updateData.cost = null;
  }
  
  try {
    const docRef = doc(db, 'subscriptions', editingDocId);
    await updateDoc(docRef, updateData);
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
  clientOnlyFields.forEach(el => el.style.display = '');
}

function clearForm() {
  addressField.value = '';
  categoryField.value = 'clients';
  connectionDateField.value = '';
  equipmentIdField.value = '';
  durationField.value = '1';
  domainNameField.value = '';
  costField.value = '';
  routerUsernameField.value = '';
  routerPasswordField.value = '';
  clientOnlyFields.forEach(el => el.style.display = '');
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

// Функция запроса данных с роутера
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
    
    displayRouterData(data);
    
  } catch (error) {
    routerContent.innerHTML = `
      <p style="color: var(--danger);">❌ Ошибка соединения: ${escapeHtml(error.message)}</p>
    `;
  }
}

// Функция отображения данных роутера
function displayRouterData(data) {
  let html = '';
  
  // Время обновления данных
  if (data._updatedAt) {
    const updateTime = new Date(data._updatedAt);
    const now = new Date();
    const diffMin = Math.floor((now - updateTime) / 60000);
    let timeAgo;
    
    if (diffMin < 1) timeAgo = 'только что';
    else if (diffMin < 60) timeAgo = `${diffMin} мин. назад`;
    else {
      const diffHours = Math.floor(diffMin / 60);
      timeAgo = `${diffHours} ч. назад`;
    }
    
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <span style="color: var(--success);">✅ Данные получены</span>
        <span style="font-size:0.8rem; color: var(--muted);">
          🕐 ${updateTime.toLocaleString('ru-RU')} (${timeAgo})
          ${data._cached ? ' • Из кэша' : ''}
        </span>
      </div>`;
  } else {
    html += '<div style="color: var(--success); margin-bottom: 12px;">✅ Данные получены успешно</div>';
  }

  // Версия прошивки
  if (data.version) {
    html += `
      <div style="background:#f0fdf4; border-radius:10px; padding:10px 14px; margin-bottom:10px; font-size:0.9rem;">
        <strong>📦 Версия:</strong> ${escapeHtml(data.version.title || '—')} — ${escapeHtml(data.version.model || '—')}
      </div>`;
  }

  // Система
  if (data.system) {
    const s = data.system;
    const uptimeSec = parseInt(s.uptime) || 0;
    const d = Math.floor(uptimeSec / 86400);
    const h = Math.floor((uptimeSec % 86400) / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    
    html += `
      <div style="background:#f8fafc; border-radius:10px; padding:10px 14px; margin-bottom:10px; font-size:0.9rem; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <span>⏱️ <strong>Аптайм:</strong> ${d} дн. ${h} ч. ${m} мин.</span>
        <span>🔥 <strong>CPU:</strong> ${s.cpuload || 0}%</span>
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
      <div style="background:#eff6ff; border-radius:10px; padding:10px 14px; margin-bottom:10px; font-size:0.9rem;">
        <div style="font-weight:600; margin-bottom:6px;">🌐 Интернет (${escapeHtml(w.description || w['interface-name'] || 'WAN')})</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <span>🟢 Подключен</span>
          <span>IP: <strong>${escapeHtml(w.address || '—')}</strong></span>
          <span>Порт: ${w.port?.speed || '—'} Mbps</span>
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
      <div style="background:#fef3c7; border-radius:10px; padding:10px 14px; margin-bottom:10px; font-size:0.9rem;">
        <div style="font-weight:600; margin-bottom:6px;">🔒 VPN (${escapeHtml(v.description || v['interface-name'] || 'VPN')})</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <span>🟢 Подключен</span>
          <span>IP: <strong>${escapeHtml(v.address || '—')}</strong></span>
          <span>Сервер: ${escapeHtml(v['remote-endpoint-address'] || '—')}</span>
          <span>Время: ${vd} дн. ${vh} ч. ${vm} мин.</span>
        </div>
      </div>`;
  }

  if (!data.version && !data.system && !data.wan && !data.vpn) {
    html += '<p style="color: var(--muted);">Нет данных для отображения</p>';
  }

  routerContent.innerHTML = html;
}

// Загрузка и отображение таблицы с группировкой
function loadSubscriptions() {
  const q = query(collection(db, 'subscriptions'), where('userId', '==', currentUser.uid));
  onSnapshot(q, snapshot => {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-message">Нет добавленных подписок</td></tr>';
      return;
    }
    
    // Группируем записи
    const groups = {
      personal: { title: '👤 Личные', items: [] },
      work: { title: '💼 Рабочие', items: [] },
      clients: { title: '👥 Клиенты', items: [] }
    };
    
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      const category = d.category || 'clients';
      if (groups[category]) {
        groups[category].items.push({ id: docSnap.id, ...d });
      }
    });
    
    // Отрисовываем группы
    Object.values(groups).forEach(group => {
      if (group.items.length === 0) return;
      
      // Заголовок группы
      const groupRow = document.createElement('tr');
      groupRow.innerHTML = `
        <td colspan="10" style="background:#f1f5f9; padding:10px 14px; font-weight:600; font-size:0.95rem; border-bottom:2px solid #e2e8f0;">
          ${group.title} (${group.items.length})
        </td>`;
      tbody.appendChild(groupRow);
      
      // Записи группы
      group.items.forEach(d => {
        const endDate = d.connectionDate ? new Date(d.connectionDate.toDate()) : null;
        if (endDate) endDate.setMonth(endDate.getMonth() + (d.subscriptionDuration || 0));
        
        let domainLink = d.domainName;
        if (d.domainName && !d.domainName.startsWith('http')) {
          domainLink = 'http://' + d.domainName;
        }
        
        const row = document.createElement('tr');
        
        if (d.category === 'clients') {
          // Полная строка для клиентов
          row.innerHTML = `
            <td>${escapeHtml(d.address)}</td>
            <td>${d.connectionDate ? d.connectionDate.toDate().toLocaleDateString() : '—'}</td>
            <td><a href="#" class="payberry-link" data-id="${escapeHtml(d.equipmentId)}">${escapeHtml(d.equipmentId)}</a></td>
            <td>${d.subscriptionDuration || '—'} мес.</td>
            <td>${d.domainName ? `<a href="${domainLink}" target="_blank">${escapeHtml(d.domainName)}</a>` : '—'}</td>
            <td>${d.cost ? d.cost.toLocaleString('ru-RU') + ' ₽' : '—'}</td>
            <td>${endDate ? endDate.toLocaleDateString() : '—'}</td>
            <td>
              ${d.routerUsername ? `<span class="created-by">🔑 ${escapeHtml(d.routerUsername)}</span>` : '—'}
            </td>
            <td><span class="created-by">${escapeHtml(d.userEmail || '—')}</span></td>
            <td>
              <div class="action-btns">
                ${d.domainName && d.routerUsername && d.routerPassword ? 
                  `<button class="btn-icon btn-router" data-id="${d.id}">📡</button>` : ''}
                <button class="btn-icon btn-edit" data-id="${d.id}">✏️</button>
                <button class="btn-icon btn-delete" data-id="${d.id}">🗑️</button>
              </div>
            </td>`;
        } else {
          // Упрощённая строка для личных и рабочих
          row.innerHTML = `
            <td>${escapeHtml(d.address)}</td>
            <td>—</td>
            <td><a href="#" class="payberry-link" data-id="${escapeHtml(d.equipmentId)}">${escapeHtml(d.equipmentId)}</a></td>
            <td>—</td>
            <td>${d.domainName ? `<a href="${domainLink}" target="_blank">${escapeHtml(d.domainName)}</a>` : '—'}</td>
            <td>—</td>
            <td>—</td>
            <td>
              ${d.routerUsername ? `<span class="created-by">🔑 ${escapeHtml(d.routerUsername)}</span>` : '—'}
            </td>
            <td><span class="created-by">${escapeHtml(d.userEmail || '—')}</span></td>
            <td>
              <div class="action-btns">
                ${d.domainName && d.routerUsername && d.routerPassword ? 
                  `<button class="btn-icon btn-router" data-id="${d.id}">📡</button>` : ''}
                <button class="btn-icon btn-edit" data-id="${d.id}">✏️</button>
                <button class="btn-icon btn-delete" data-id="${d.id}">🗑️</button>
              </div>
            </td>`;
        }
        
        tbody.appendChild(row);
      });
    });
    
    // Навешиваем обработчики
    attachEventHandlers();
  });
}

function attachEventHandlers() {
  document.querySelectorAll('.payberry-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      handleEquipmentClick(e.target.closest('a').dataset.id);
    });
  });

  document.querySelectorAll('.btn-router').forEach(btn => {
    btn.addEventListener('click', (e) => {
      fetchRouterData(e.target.closest('button').dataset.id);
    });
  });

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      startEdit(e.target.closest('button').dataset.id);
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      openDeleteModal(e.target.closest('button').dataset.id);
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
        
        categoryField.value = d.category || 'clients';
        addressField.value = d.address || '';
        equipmentIdField.value = d.equipmentId || '';
        domainNameField.value = d.domainName || '';
        routerUsernameField.value = d.routerUsername || '';
        routerPasswordField.value = d.routerPassword || '';
        
        if (d.connectionDate) {
          connectionDateField.value = d.connectionDate.toDate().toISOString().split('T')[0];
        }
        durationField.value = d.subscriptionDuration || 1;
        costField.value = d.cost || '';
        
        // Показываем/скрываем поля клиентов
        const isClient = d.category === 'clients';
        clientOnlyFields.forEach(el => el.style.display = isClient ? '' : 'none');
        
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
