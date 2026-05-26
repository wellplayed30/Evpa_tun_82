import { auth, db } from './app.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, user => {
  if (!user) window.location.href = 'index.html';
  else {
    currentUser = user;
    loadSubscriptions();
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

document.getElementById('addBtn').addEventListener('click', async () => {
  if (!currentUser) return;
  const data = {
    userId: currentUser.uid,
    address: document.getElementById('address').value,
    connectionDate: new Date(document.getElementById('connectionDate').value),
    equipmentId: document.getElementById('equipmentId').value,
    subscriptionDuration: parseInt(document.getElementById('duration').value),
    domainName: document.getElementById('domainName').value,
    cost: parseFloat(document.getElementById('cost').value),
    notifiedThreeDays: false,
    createdAt: serverTimestamp()
  };
  try {
    await addDoc(collection(db, 'subscriptions'), data);
    document.getElementById('address').value = '';
    document.getElementById('connectionDate').value = '';
    document.getElementById('equipmentId').value = '';
    document.getElementById('duration').value = '1';
    document.getElementById('domainName').value = '';
    document.getElementById('cost').value = '';
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
});

function loadSubscriptions() {
  const q = query(collection(db, 'subscriptions'), where('userId', '==', currentUser.uid));
  onSnapshot(q, snapshot => {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    snapshot.forEach(doc => {
      const d = doc.data();
      const endDate = new Date(d.connectionDate.toDate());
      endDate.setMonth(endDate.getMonth() + d.subscriptionDuration);
      const row = `<tr>
        <td>${d.address}</td>
        <td>${d.connectionDate.toDate().toLocaleDateString()}</td>
        <td>${d.equipmentId}</td>
        <td>${d.subscriptionDuration}</td>
        <td>${d.domainName}</td>
        <td>${d.cost}</td>
        <td>${endDate.toLocaleDateString()}</td>
      </tr>`;
      tbody.insertAdjacentHTML('beforeend', row);
    });
  });
}