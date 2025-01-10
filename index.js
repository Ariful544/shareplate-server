const express = require("express");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
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

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vedvc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const foodCollections = client.db("foodStore").collection("food");
    const subscribeCollections = client.db("foodStore").collection("subscribe");
    const requestedFoodCollections = client
      .db("foodStore")
      .collection("requestedFood");

    app.get("/", async (req, res) => {
      res.send("Hello World!");
    });
    // auth related api
    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
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
        .send({ success: true, message: "Token remove successfully" });
    });
    app.post("/add-food", verifyToken, async (req, res) => {
      const food = req.body;
      const result = await foodCollections.insertOne(food);
      res.json(result);
    });
    app.get("/available-foods", async (req, res) => {
      const { sort } = req.query;
      const sortOrder = sort === "asc" ? 1 : -1;
      const cursor = foodCollections
        .find({ status: "available" })
        .sort({ expired_datetime: sortOrder });
      const foods = await cursor.toArray();
      res.send(foods);
    });
    app.get("/featured-food", async (req, res) => {
      const cursor = foodCollections
        .find()
        .limit(6)
        .sort({ food_quantity: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    // my food request api
    app.get("/requested-foods", verifyToken, async (req, res) => {
      const email = req.query.email;
      const filter = { user_email: email };
      if (req.user?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden token" });
      }
      const result = await requestedFoodCollections.find(filter).toArray();
      res.send(result);
    });
    // my added foods api
    app.get("/manage-my-foods", verifyToken, async (req, res) => {
      const email = req.query.email;
      const filter = { donator_email: email };
      if (req.user?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden token" });
      }
      const result = await foodCollections.find(filter).toArray();
      res.send(result);
    });
    app.get("/manage-my-food/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await foodCollections.findOne(filter);
      res.send(result);
    });
    app.patch("/update-food/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const UpdateBody = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          food_name: UpdateBody.food_name,
          food_quantity: UpdateBody.food_quantity,
          food_quantity_type: UpdateBody.food_quantity_type,
          pickup_location: UpdateBody.pickup_location,
          expired_datetime: UpdateBody.expired_datetime,
          food_image: UpdateBody.food_image,
          additional_notes: UpdateBody.additional_notes,
        },
      };
      const result = await foodCollections.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.patch("/change-status/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "requested" },
      };
      const result = await foodCollections.updateOne(filter, updateDoc);
      res.send(result);
    });
    // search food item by name
    app.get("/search-food", async (req, res) => {
      const { search } = req.query;
      const baseFilter = { status: "available" };
      let searchFilter = {};
      if (search) {
        searchFilter = { food_name: { $regex: search, $options: "i" } };
      }
      const filter = {
        $and: [baseFilter, searchFilter],
      };
      const cursor = foodCollections.find(filter);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollections.findOne(query);
      res.send(result);
    });
    app.delete("/delete-food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodCollections.deleteOne(query);
      res.send(result);
    });
    app.post("/request-food", async (req, res) => {
      const requestedFood = req.body;
      const result = await requestedFoodCollections.insertOne(requestedFood);
      res.send(result);
    });
    app.post('/subscribe', async (req, res) => {
      const email = req.body;
      const result = await subscribeCollections.insertOne(email);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
