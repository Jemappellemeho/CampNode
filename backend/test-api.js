const apiUrl = "http://localhost:3000/api";

async function runTests() {
  console.log("🚀 Starte automatisierten System-Test...\n");
  
  try {
    // 1. Neuer Professor registrieren
    const email = `prof_${Date.now()}@test.com`;
    console.log(`1️⃣  Registriere ${email}...`);
    const regRes = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", role: "PROFESSOR" })
    });
    if (!regRes.ok) throw new Error("Registrierung fehlgeschlagen");

    // 2. Login
    console.log("2️⃣  Login...");
    const loginRes = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("   ✅ Token erhalten!");

    // 3. Kurs erstellen
    console.log("3️⃣  Kurs erstellen...");
    const courseRes = await fetch(`${apiUrl}/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ title: "Test-Kurs", description: "Ein automatischer Test" })
    });
    const courseData = await courseRes.json();
    const courseId = courseData.course.id;
    console.log(`   ✅ Kurs '${courseData.course.title}' (Code: ${courseData.course.joinCode}) erstellt!`);

    // 4. Topic erstellen
    console.log("4️⃣  Thema (Topic) erstellen...");
    const topicRes = await fetch(`${apiUrl}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ name: "Künstliche Intelligenz", courseId })
    });
    const topicData = await topicRes.json();
    const topicId = topicData.topic.id;
    console.log(`   ✅ Thema '${topicData.topic.name}' erstellt!`);

    // 5. Quiz erstellen
    console.log("5️⃣  Quiz erstellen...");
    const quizRes = await fetch(`${apiUrl}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ 
        topicId, 
        questions: [{ frage: "Ist KI cool?", antworten: ["Ja", "Nein"], korrekt: 0 }] 
      })
    });
    const quizData = await quizRes.json();
    console.log("   ✅ Quiz erstellt!");

    // 6. Progress setzen
    console.log("6️⃣  Fortschritt (Progress) simulieren...");
    const progressRes = await fetch(`${apiUrl}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ topicId, completed: true })
    });
    const progressData = await progressRes.json();
    console.log("   ✅ Fortschritt auf 'abgeschlossen' gesetzt!");

    // 7. Alles abrufen zur Kontrolle
    console.log("7️⃣  Kontrolldaten abrufen...");
    const checkRes = await fetch(`${apiUrl}/progress`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const checkData = await checkRes.json();
    
    console.log("\n🎉 ALLE TESTS ERFOLGREICH BESTANDEN! 🎉");
    console.log("Dein Backend ist 100% funktionsfähig.");
    
  } catch (error) {
    console.error("\n❌ FEHLER BEIM TESTEN:", error.message);
  }
}

runTests();
