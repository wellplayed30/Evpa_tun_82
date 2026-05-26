import { auth, db } from './app.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, onSnapshot, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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

// Функция запроса данных с роутера (НАПРЯМУЮ из браузера)
async function fetchRouterData(docId) {
  routerContent.innerHTML = '<p>⏳ Загрузка данных с роутера...</p>';
  routerModal.classList.add('active');
  
  try {
    const docSnap = await getDoc(doc(db, 'subscriptions', docId));
    
    if (!docSnap.exists()) {
      routerContent.innerHTML = '<p style="color: var(--danger);">❌ Запись не найдена</p>';
      return;
    }
    
    const d = docSnap.data();
    const domainName = d.domainName || '';
    const routerUsername = d.routerUsername || '';
    const routerPassword = d.routerPassword || '';
    
    if (!domainName || !routerUsername || !routerPassword) {
      routerContent.innerHTML = '<p style="color: var(--danger);">❌ Не заполнены данные роутера</p>';
      return;
    }
    
    const cleanDomain = domainName.replace(/^https?:\/\//, '');
    const auth = btoa(`${routerUsername}:${routerPassword}`);
    const baseUrl = `https://${cleanDomain}`;
    
    const result = {};
    let successCount = 0;
    let failCount = 0;
    
    // Функция запроса через прокси
    async function fetchViaProxy(endpoint) {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl + endpoint)}`;
      try {
        const resp = await fetch(proxyUrl, {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        });
        if (resp.ok) {
          return await resp.json();
        }
      } catch (e) {}
      return null;
    }
    
    // Система
    const sysData = await fetchViaProxy('/rci/show/system');
    if (sysData) { result.system = sysData; successCount++; } else { failCount++; }
    
    // Версия
    const verData = await fetchViaProxy('/rci/show/version');
    if (verData) { result.version = verData; successCount++; } else { failCount++; }
    
    // Интернет
    const wanData = await fetchViaProxy('/rci/show/interface/GigabitEthernet1');
    if (wanData) { result.wan = wanData; successCount++; } else { failCount++; }
    
    // VPN
    const vpnData = await fetchViaProxy('/rci/show/interface/PPTP1');
    if (vpnData) { result.vpn = vpnData; successCount++; } else { failCount++; }
    
    // Порты
    const portsData = await fetchViaProxy('/rci/show/interface');
    if (portsData) {
      result.ports = {};
      if (portsData['1']) result.ports.port1 = portsData['1'];
      if (portsData['2']) result.ports.port2 = portsData['2'];
      if (portsData['3']) result.ports.port3 = portsData['3'];
      successCount++;
    } else {
      failCount++;
    }
    
    if (successCount === 0) {
      // Пробуем без прокси (для десктопа)
      routerContent.innerHTML = '<p>⏳ Пробуем прямое подключение...</p>';
      
      try {
        const directResp = await fetch(`${baseUrl}/rci/show/interface`, {
          headers: { 'Authorization': `Basic ${auth}` },
          mode: 'no-cors'
        });
        
        if (directResp.ok || directResp.type === 'opaque') {
          routerContent.innerHTML = `
            <p style="color: var(--warning);">⚠️ Браузер блокирует прямой запрос</p>
            <p style="font-size: 0.9em; color: var(--muted);">
              Откройте API роутера напрямую и скопируйте данные:<br>
              <a href="${baseUrl}/rci/show/interface" target="_blank" style="color: var(--primary); word-break: break-all;">${baseUrl}/rci/show/interface</a>
            </p>
            <textarea id="manualJsonInput" placeholder="Вставьте JSON сюда..." style="width:100%; height:150px; margin-top:10px; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:0.85em;"></textarea>
            <button id="parseJsonBtn" style="margin-top:10px; padding:12px; background: var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; width:100%;">📊 Показать</button>
          `;
          
          document.getElementById('parseJsonBtn').addEventListener('click', () => {
            try {
              const data = JSON.parse(document.getElementById('manualJsonInput').value);
              const r = {};
              if (data.GigabitEthernet1) r.wan = data.GigabitEthernet1;
              if (data.PPTP1) r.vpn = data.PPTP1;
              r.ports = {};
              if (data['1']) r.ports.port1 = data['1'];
              if (data['2']) r.ports.port2 = data['2'];
              if (data['3']) r.ports.port3 = data['3'];
              displayRouterData(r);
            } catch (e) {
              alert('Ошибка JSON: ' + e.message);
            }
          });
          
          window.open(`${baseUrl}/rci/show/interface`, '_blank');
          return;
        }
      } catch (e) {}
      
      routerContent.innerHTML = '<p style="color: var(--danger);">❌ Не удалось получить данные ни через прокси, ни напрямую.</p>';
      return;
    }
    
    displayRouterData(result);
    
  } catch (error) {
    routerContent.innerHTML = `
      <p style="color: var(--danger);">❌ Ошибка: ${escapeHtml(error.message)}</p>
    `;
  }
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
