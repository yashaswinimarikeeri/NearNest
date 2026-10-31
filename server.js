
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const propertySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    city: { type: String, required: true },
    area: String,
    pincode: String,
    rent: Number,
    accommodationType: String,
    genderPolicy: String,
    foodAvailable: Boolean,
    imageUrl: String,
    latitude: Number,
    longitude: Number,
    description: String,
    isDemo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Property = mongoose.model("Property", propertySchema);

// Get property listings
app.get("/api/properties", async (req, res) => {
  try {
    const properties = await Property.find().sort({ createdAt: -1 });
    res.json(properties);
  } catch (error) {
    res.status(500).json({ message: "Could not load properties" });
  }
});

// Add a property
app.post("/api/properties", async (req, res) => {
  try {
    const property = await Property.create(req.body);
    res.status(201).json(property);
  } catch (error) {
    res.status(400).json({
      message: "Could not add property",
      error: error.message
    });
  }
});

// Add sample listings only when the collection is empty
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from your .env file");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB successfully!");

    const count = await Property.countDocuments();

    if (count === 0) {
      await Property.insertMany([
        {
          name: "Green Nest Girls Hostel",
          city: "Bengaluru",
          area: "Electronic City",
          rent: 7500,
          accommodationType: "Hostel",
          genderPolicy: "Girls",
          foodAvailable: true,
          imageUrl: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600",
          latitude: 12.8452,
          longitude: 77.6602,
          description: "Demo listing for student accommodation",
          isDemo: true
        },
        {
          name: "Campus Stay Boys Hostel",
          city: "Bengaluru",
          area: "BTM Layout",
          rent: 6500,
          accommodationType: "Hostel",
          genderPolicy: "Boys",
          foodAvailable: true,
          imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600",
          latitude: 12.9166,
          longitude: 77.6101,
          description: "Demo listing for student accommodation",
          isDemo: true
        },
        {
          name: "Urban Shared Living",
          city: "Bengaluru",
          area: "Koramangala",
          rent: 9000,
          accommodationType: "Co-living",
          genderPolicy: "Co-living",
          foodAvailable: false,
          imageUrl: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600",
          latitude: 12.9352,
          longitude: 77.6245,
          description: "Demo shared accommodation",
          isDemo: true
        },
        {
          name: "Sunrise PG",
          city: "Bengaluru",
          area: "Marathahalli",
          rent: 8000,
          accommodationType: "PG",
          genderPolicy: "Girls",
          foodAvailable: true,
          imageUrl: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=600",
          latitude: 12.9591,
          longitude: 77.6974,
          description: "Demo PG listing",
          isDemo: true
        },
        {
          name: "Comfort Corner Rooms",
          city: "Bengaluru",
          area: "Whitefield",
          rent: 10000,
          accommodationType: "PG",
          genderPolicy: "Boys",
          foodAvailable: false,
          imageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600",
          latitude: 12.9698,
          longitude: 77.7500,
          description: "Demo room listing",
          isDemo: true
        },
        {
          name: "Budget Shared Home",
          city: "Bengaluru",
          area: "HSR Layout",
          rent: 7000,
          accommodationType: "Co-living",
          genderPolicy: "Co-living",
          foodAvailable: true,
          imageUrl: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600",
          latitude: 12.9116,
          longitude: 77.6389,
          description: "Demo shared home",
          isDemo: true
        }
      ]);

      console.log("Six demo properties added.");
    }

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`NearNest is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup error:", error.message);
    process.exit(1);
  }
}

startServer();
