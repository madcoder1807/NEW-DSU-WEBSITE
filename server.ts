import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK with telemetry header
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({
  apiKey: geminiApiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const DB_FILE = path.join(process.cwd(), "db.json");

// Helper to load/save database state
function loadDB() {
  const defaultDB = {
    users: [
      {
        id: "senior_ayan",
        name: "Ayan Srivastava",
        email: "ayan.dsu@mmmut.ac.in",
        rollNumber: "2022021045",
        branch: "Computer Science & Engineering",
        role: "admin",
        points: 1540,
        completedProblems: ["arr_1", "arr_2", "ll_1", "dp_1"],
        notes: []
      },
      {
        id: "senior_ritika",
        name: "Ritika Mishra",
        email: "ritika.cp@mmmut.ac.in",
        rollNumber: "2022011032",
        branch: "Information Technology",
        role: "student",
        points: 1210,
        completedProblems: ["arr_1", "ll_1", "graph_1"],
        notes: []
      },
      {
        id: "guest_user",
        name: "Guest Coder",
        email: "guest@mmmut.ac.in",
        rollNumber: "2025011001",
        branch: "Computer Science",
        role: "student",
        points: 180,
        completedProblems: ["arr_1"],
        notes: []
      }
    ],
    announcements: [
      {
        id: "a_1",
        title: "CodeSpree v4.0 - Annual Coding Showdown",
        content: "Gear up! DSU's yearly competitive coding combat is coming live this Sunday on CodeChef. Cash rewards and elite certificates for top MMMUT freshers!",
        category: "contest",
        date: "2026-05-28",
        author: "Ayan Srivastava"
      },
      {
        id: "a_2",
        title: "Intro To GSoC & Open Source Workshop",
        content: "Join our interactive workshop in the IT Seminar Hall. Learn how to crack Google Summer of Code from seniors who already made it!",
        category: "workshop",
        date: "2026-05-30",
        author: "Ritika Mishra"
      },
      {
        id: "a_3",
        title: "DSU Alumni Spotlights - FAANG Experts",
        content: "Proud moment: Our core members got offered software roles at Google India & Amazon. Stay tuned for their upcoming interview AMA session!",
        category: "achievement",
        date: "2026-05-25",
        author: "DSU Core"
      }
    ],
    resources: [
      {
        id: "res_1",
        title: "Striver's A2Z DSA Sheet Companion Video Lectures",
        category: "Playlist",
        tags: ["DSA", "Striver", "Placement"],
        link: "https://www.youtube.com/playlist?list=PLgUwDviBHe0oF569_d_Yi_XQU9L_yG08L",
        author: "Ayan Srivastava",
        likes: 34
      },
      {
        id: "res_2",
        title: "CP-Algorithms English Mirror - Crucial Algorithms & Implementations",
        category: "Resource",
        tags: ["CP", "Algorithms", "Math"],
        link: "https://cp-algorithms.com/",
        author: "Ayan Srivastava",
        likes: 27
      },
      {
        id: "res_3",
        title: "Interactive Git & GitHub Visual Playground",
        category: "Template",
        tags: ["Git", "Web Dev", "OpenSource"],
        link: "https://learngitbranching.js.org/",
        author: "Ritika Mishra",
        likes: 19
      }
    ]
  };

  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(data);
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf-8");
      return defaultDB;
    }
  } catch (err) {
    console.error("Error reading database file, using fallback in-memory state", err);
    return defaultDB;
  }
}

function saveDB(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed saving database to disc:", err);
  }
}

// REST API endpoints

// User Auth endpoint
app.post("/api/auth/register", (req, res) => {
  const { name, email, rollNumber, branch, password } = req.body;
  
  if (!name || !email || !rollNumber) {
    return res.status(400).json({ error: "Missing required registration parameters." });
  }

  const db = loadDB();
  const existingUser = db.users.find((u: any) => u.email === email || u.rollNumber === rollNumber);
  if (existingUser) {
    return res.status(400).json({ error: "Student account with this Email or Roll Number already exists." });
  }

  const newUser = {
    id: "user_" + Date.now(),
    name,
    email,
    rollNumber,
    branch: branch || "Computer Science",
    role: "student",
    points: 100, // starting gift
    completedProblems: [],
    notes: []
  };

  db.users.push(newUser);
  saveDB(db);

  res.status(201).json({ user: newUser, token: newUser.id });
});

app.post("/api/auth/login", (req, res) => {
  const { rollOrEmail } = req.body;
  if (!rollOrEmail) {
    return res.status(400).json({ error: "Please enter your Email or Roll Number." });
  }

  const db = loadDB();
  const user = db.users.find(
    (u: any) => u.email.toLowerCase() === rollOrEmail.toLowerCase() || u.rollNumber === rollOrEmail
  );

  if (!user) {
    return res.status(404).json({ error: "Invalid credentials. Try guest account (ritika.cp@mmmut.ac.in or login as Guest)." });
  }

  res.json({ user, token: user.id });
});

// Sync Points and Problem completition
app.post("/api/user/solve", (req, res) => {
  const userId = req.headers.authorization;
  const { problemId, status } = req.body; // status is boolean: true=solved, false=unsolved

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized access. No session token found." });
  }

  const db = loadDB();
  const userIndex = db.users.findIndex((u: any) => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: "User profile not found." });
  }

  const user = db.users[userIndex];
  if (!user.completedProblems) {
    user.completedProblems = [];
  }

  const alreadySolved = user.completedProblems.includes(problemId);

  if (status && !alreadySolved) {
    user.completedProblems.push(problemId);
    user.points += 25; // Award 25 points per solution checked!
  } else if (!status && alreadySolved) {
    user.completedProblems = user.completedProblems.filter((p: string) => p !== problemId);
    user.points = Math.max(0, user.points - 25);
  }

  db.users[userIndex] = user;
  saveDB(db);

  res.json({ success: true, points: user.points, completedProblems: user.completedProblems });
});

// Load user notes
app.get("/api/user/notes", (req, res) => {
  const userId = req.headers.authorization;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const db = loadDB();
  const user = db.users.find((u: any) => u.id === userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({ notes: user.notes || [] });
});

// Save user notes
app.post("/api/user/notes", (req, res) => {
  const userId = req.headers.authorization;
  const { title, content, noteId } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const db = loadDB();
  const userIndex = db.users.findIndex((u: any) => u.id === userId);
  if (userIndex === -1) return res.status(404).json({ error: "User not found" });

  const user = db.users[userIndex];
  if (!user.notes) user.notes = [];

  if (noteId) {
    const noteIdx = user.notes.findIndex((n: any) => n.id === noteId);
    if (noteIdx !== -1) {
      user.notes[noteIdx] = {
        id: noteId,
        title,
        content,
        updatedAt: new Date().toISOString()
      };
    } else {
      user.notes.push({
        id: noteId,
        title,
        content,
        updatedAt: new Date().toISOString()
      });
    }
  } else {
    user.notes.push({
      id: "note_" + Date.now(),
      title,
      content,
      updatedAt: new Date().toISOString()
    });
  }

  db.users[userIndex] = user;
  saveDB(db);

  res.json({ notes: user.notes });
});

// Leaderboard list
app.get("/api/leaderboard", (req, res) => {
  const db = loadDB();
  // Compile registered users sorted
  const leaderboard = db.users.map((u: any) => ({
    id: u.id,
    name: u.name,
    rollNumber: u.rollNumber.replace(/(\d{4})\d{4}(\d{2})/, "$1****$2"), // Mask roll for beauty
    branch: u.branch,
    points: u.points,
    solvedCount: u.completedProblems ? u.completedProblems.length : 0
  })).sort((a: any, b: any) => b.points - a.points);

  // Add ranking positions
  const ranked = leaderboard.map((item: any, idx: number) => ({
    ...item,
    rank: idx + 1
  }));

  res.json(ranked);
});

// Announcements list
app.get("/api/announcements", (req, res) => {
  const db = loadDB();
  res.json(db.announcements);
});

// Create announcements (Admin only/authorized users)
app.post("/api/announcements", (req, res) => {
  const userId = req.headers.authorization;
  const { title, content, category } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const db = loadDB();
  const user = db.users.find((u: any) => u.id === userId);
  if (!user) return res.status(403).json({ error: "Forbidden user session" });

  const newAnn = {
    id: "ann_" + Date.now(),
    title,
    content,
    category: category || "general",
    date: new Date().toISOString().split("T")[0],
    author: user.name
  };

  db.announcements.unshift(newAnn);
  saveDB(db);

  res.status(201).json(db.announcements);
});

// Community Resources list
app.get("/api/resources", (req, res) => {
  const db = loadDB();
  res.json(db.resources);
});

// Upload community resources
app.post("/api/resources", (req, res) => {
  const userId = req.headers.authorization;
  const { title, category, link, tags } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized access token" });

  const db = loadDB();
  const user = db.users.find((u: any) => u.id === userId);
  if (!user) return res.status(403).json({ error: "Forbidden user session" });

  const newRes = {
    id: "res_" + Date.now(),
    title,
    category: category || "Resource",
    tags: tags || ["Shared"],
    link: link.startsWith("http") ? link : "https://" + link,
    author: user.name,
    likes: 1
  };

  db.resources.push(newRes);
  saveDB(db);

  res.status(201).json(db.resources);
});

// Upvote resource
app.post("/api/resources/like", (req, res) => {
  const { resourceId } = req.body;
  const db = loadDB();
  const resIdx = db.resources.findIndex((r: any) => r.id === resourceId);
  if (resIdx !== -1) {
    db.resources[resIdx].likes += 1;
    saveDB(db);
    return res.json({ success: true, likes: db.resources[resIdx].likes });
  }
  res.status(404).json({ error: "Resource item not found" });
});


// Gemini Coding Chatbot Endpoint
app.post("/api/chatbot", async (req, res) => {
  const { messages } = req.body; // format: Array of { role: 'user' | 'model', content: string }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid message array request format." });
  }

  if (!geminiApiKey) {
    return res.json({
      reply: "Hello! I am **DSU-Bot**, your code-companion. Right now, the `GEMINI_API_KEY` is not fully configured, so I am running in Offline Sandbox Mode. However, we have pre-designed complete learning sheets, topic roadmaps (Arrays, Trees, Graphs, CP, ML), and practice dashboards for you to explore! Let me know if you want tips on competitive coding, standard interview sheets, or GSoC!"
    });
  }

  try {
    // Format messages correctly for @google/genai chats or multi-turn models
    // Since we want to use the streamlined chat API: `ai.chats.create`
    // First, let's look at the chat model.
    const systemPrompt = `You are DSU-Bot, the official premium intelligent coding chatbot assistant for 'DSU' (Disjoint Set Union) tech society of Madan Mohan Malaviya University of Technology (MMMUT), Gorakhpur.
Your target audience is college freshers and senior engineering students. You specialize in standard computer science concepts:
1. Competitive Programming (CF, Codechef, AtCoder, contest calendar, prefix sum, rating, lazy propagation, segment trees).
2. Data Structures & Algorithms (Array, Stack, LinkedList, Binary Search, DP, Graphs, Trees, sliding window).
3. Web Development (React, Next.js, Node.js, MongoDB, Glassmorphism, CSS, state).
4. AI/ML (NumPy, Pandas, TensorFlow, Deep Learning, Kaggle roadmaps).

Be expert, highly professional, encouraging, extremely concise, friendly, and structure answers in beautiful clean markdown. Use appropriate emojis occasionally for the community vibe. Present clear snippets if code is asked. Direct them to explore DSU's CP Roadster tracker, Striver A2Z sheets, or GSoC resources embedded right here in the dashboard!`;

    // Map roles to standard Roles
    let contentsPayload = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    // Generate output with the system instruction
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contentsPayload,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.8
      }
    });

    const replyText = response.text || "I was unable to formulate a code-solution at this time. Let's practice some CP problems!";
    res.json({ reply: replyText });

  } catch (error: any) {
    console.error("Gemini API server endpoint error:", error);
    res.status(500).json({
      error: "AI model error",
      reply: "My servers are processing a lot of code inquiries right now! Let me provide a helpful hint instead: focus on mastering Disjoint Set Union (Union-Find) complexity: the path compression and union-by-rank techniques reduce operations to a nearly-constant amortized time complexity, representing $O(\\alpha(N))$! Try coding it on LeetCode!"
    });
  }
});


// Configure Vite Asset Serving Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DSU MMMUT Fullstack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
