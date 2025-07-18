const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const admin = require("./firebase");

const app = express();
const port = process.env.PORT || 3000;
const uri = process.env.MONGO_URI;

// Middleware
app.use(
  cors({
    origin: "https://food-fridge-8be96.web.app",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Mongo Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify Firebase token
const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1] || req.cookies.token;
  if (!token) return res.status(401).send({ error: "Unauthorized" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (err) {
    return res.status(403).send({ error: "Invalid token" });
  }
};

let foodsCollection;

// Mongo Function
async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    const db = client.db("foodDB");
    foodsCollection = db.collection("foods");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}
connectDB();

// POST foods
app.post("/foods", verifyFirebaseToken, async (req, res) => {
  const food = req.body;

  // adding user
  food.addedBy = req.decoded.email;

  if (!food.addedBy) {
    return res.status(400).send({ error: "Missing user email (addedBy)" });
  }

  try {
    // POSTING
    const result = await foodsCollection.insertOne(food);
    res.status(201).send(result);
  } catch (error) {
    console.error("Insert failed:", error);
    res.status(500).send({ error: "Failed to add food" });
  }
});

// GET foods for public
app.get("/foods", async (req, res) => {
  try {
    // GETTING
    const result = await foodsCollection.find({}).toArray();
    res.status(200).send(result);
  } catch (error) {
    console.error("Fetch failed:", error);
    res.status(500).send({ error: "Failed to get food items" });
  }
});

// GET user-foods verify lagbe
app.get("/user-foods", verifyFirebaseToken, async (req, res) => {
  const email = req.decoded.email;
  try {
    // GETTING
    const result = await foodsCollection.find({ addedBy: email }).toArray();
    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({ error: "Failed to get user's food items" });
  }
});

// GET specific food
app.get("/foods/:id", async (req, res) => {
  // food id pabo
  const id = req.params.id;
  // check korbo
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid ID format" });
  }

  try {
    // GETTING
    const food = await foodsCollection.findOne({ _id: new ObjectId(id) });

    if (!food) {
      return res.status(404).send({ error: "Food not found" });
    }

    res.send(food);
  } catch (error) {
    console.error("Error getting food:", error);
    res.status(500).send({ error: "Failed to get food" });
  }
});

// DELETE foods verify lagbe

app.delete("/foods/:id", verifyFirebaseToken, async (req, res) => {
  // food id
  const id = req.params.id;
  // user nibo
  const userEmail = req.decoded.email;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid ID format" });
  }

  try {
    // DELETING
    const result = await foodsCollection.deleteOne({
      _id: new ObjectId(id),
      addedBy: userEmail,
    });

    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Food deleted", deletedCount: 1 });
    } else {
      res.status(404).send({
        success: false,
        message: "Food not found or unauthorized",
      });
    }
  } catch (error) {
    console.error("Delete failed:", error);
    res.status(500).send({ error: "Failed to delete recipe" });
  }
});

// PUT/Update  food verify lagbe
app.put("/foods/:id", verifyFirebaseToken, async (req, res) => {
  // food id
  const id = req.params.id;
  // update kora food
  const updatedFood = { ...req.body };
  // user
  const userEmail = req.decoded.email;

  delete updatedFood._id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid ID format" });
  }

  try {
    // UPDATING
    const result = await foodsCollection.updateOne(
      { _id: new ObjectId(id), addedBy: userEmail },
      { $set: updatedFood }
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true, message: "Food updated" });
    } else {
      res.status(404).send({
        success: false,
        message: "Food not found, unauthorized, or already up-to-date",
      });
    }
  } catch (error) {
    console.error("Update failed:", error);
    res.status(500).send({ error: "Failed to update recipe" });
  }
});

// POST Firebase token
app.post("/auth/login", async (req, res) => {
  // token nibo
  const { token } = req.body;
  // check korbo
  if (!token) return res.status(400).json({ error: "Token required" });

  try {
    // VERIFYING
    const decoded = await admin.auth().verifyIdToken(token);

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,  
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true, email: decoded.email });
  } catch (err) {
    console.error("JWT verification failed:", err);
    res.status(401).json({ error: "Invalid token" });
  }
});

// POST -Clear  cookie
app.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

app.get("/", (req, res) => {
  res.send("✅ Server is running with MongoDB connected");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
