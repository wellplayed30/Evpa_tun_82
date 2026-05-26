import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBw63ij9uh2rjIM9mme3TcKMqY23AIy4vU",
  authDomain: "evpavpn.firebaseapp.com",
  projectId: "evpavpn",
  storageBucket: "evpavpn.firebasestorage.app",
  messagingSenderId: "432219769353",
  appId: "1:432219769353:web:1c9adc245b6a92296d06d8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);