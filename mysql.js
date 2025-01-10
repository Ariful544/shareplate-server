const express = require("express");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");

const port = process.env.PORT || 3000;
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://a11-shareplate-website.web.app",
      "https://a11-shareplate-website.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unAuthorized token" });
  }
  jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decode) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden token" });
    }
    req.user = decode;
    next();
  });
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.get("/", async (req, res) => {
  res.send("Hello World!");
});

// Auth related API
app.post("/jwt", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({ success: false, message: "Email is required" });
  }

  const token = jwt.sign({ email }, process.env.SECRET_ACCESS_TOKEN, {
    expiresIn: "5h",
  });
  res
    .cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    })
    .send({ success: true, message: "Token sent successfully" });
});

app.post("/logout", async (req, res) => {
  res
    .clearCookie("token", {
      httpOnly: true,
      secure: false,
    })
    .send({ success: true, message: "Token removed successfully" });
});

// Add Food
app.post("/add-food", verifyToken, async (req, res) => {
  const food = req.body;
  try {
    const [result] = await pool.query("INSERT INTO food SET ?", food);
    res.json(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Available Foods
app.get("/available-foods", async (req, res) => {
  const { sort } = req.query;
  const sortOrder = sort === "asc" ? "ASC" : "DESC";
  try {
    const [foods] = await pool.query(
      `SELECT * FROM food WHERE status = 'available' ORDER BY expired_datetime ${sortOrder}`
    );
    res.send(foods);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Featured Foods
app.get("/featured-food", async (req, res) => {
  try {
    const [result] = await pool.query(
      "SELECT * FROM food ORDER BY food_quantity DESC LIMIT 6"
    );
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Requested Foods
app.get("/requested-foods", verifyToken, async (req, res) => {
  const email = req.query.email;
  if (req.user?.email !== email) {
    return res.status(403).send({ message: "Forbidden token" });
  }
  try {
    const [result] = await pool.query(
      "SELECT * FROM requested_food WHERE user_email = ?",
      [email]
    );
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get My Added Foods
app.get("/manage-my-foods", verifyToken, async (req, res) => {
  const email = req.query.email;
  if (req.user?.email !== email) {
    return res.status(403).send({ message: "Forbidden token" });
  }
  try {
    const [result] = await pool.query(
      "SELECT * FROM food WHERE donator_email = ?",
      [email]
    );
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Food by ID
app.get("/food/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query("SELECT * FROM food WHERE id = ?", [id]);
    res.send(result[0]);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Update Food
app.patch("/update-food/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const updateBody = req.body;
  try {
    const [result] = await pool.query("UPDATE food SET ? WHERE id = ?", [updateBody, id]);
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Change Food Status
app.patch("/change-status/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query("UPDATE food SET status = 'requested' WHERE id = ?", [id]);
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Search Food
app.get("/search-food", async (req, res) => {
  const { search } = req.query;
  const searchQuery = `%${search}%`;
  try {
    const [result] = await pool.query(
      "SELECT * FROM food WHERE status = 'available' AND food_name LIKE ?",
      [searchQuery]
    );
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Delete Food
app.delete("/delete-food/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query("DELETE FROM food WHERE id = ?", [id]);
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Request Food
app.post("/request-food", async (req, res) => {
  const requestedFood = req.body;
  try {
    const [result] = await pool.query("INSERT INTO requested_food SET ?", requestedFood);
    res.send(result);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
