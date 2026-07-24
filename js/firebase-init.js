const firebaseConfig = {
    apiKey: "AIzaSyD3bKI2sIgCTtyV4P07jHCWg5ezLHVNPHY",
    authDomain: "flaggenquiz-1cbf5.firebaseapp.com",
    projectId: "flaggenquiz-1cbf5",
    storageBucket: "flaggenquiz-1cbf5.firebasestorage.app",
    messagingSenderId: "574905138607",
    appId: "1:574905138607:web:ac004ebf5528733837035a"
};
let firestoreDb = null;
try {
    firebase.initializeApp(firebaseConfig);
    firestoreDb = firebase.firestore();
} catch (e) {
    console.warn("Firebase konnte nicht initialisiert werden, Highscore läuft nur lokal.", e);
}
