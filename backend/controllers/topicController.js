import Topic from "../models/Topic.js";


// ================= CREATE TOPIC =================

export const createTopic = async (req, res) => {
  try {
    const { name, description, order } = req.body;

    const existingTopic = await Topic.findOne({ name });

    if (existingTopic) {
      return res.status(400).json({
        message: "Topic already exists",
      });
    }

    const topic = await Topic.create({
      name,
      description,
      order,
    });

    res.status(201).json({
      message: "Topic created successfully",
      topic,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to create topic",
    });
  }
};


// ================= GET ALL TOPICS =================

export const getAllTopics = async (req, res) => {
  try {
    const topics = await Topic.find({
      isActive: true,
    }).sort({ order: 1 });

    res.status(200).json({
      topics,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch topics",
    });
  }
};


// ================= GET TOPIC BY ID =================

export const getTopicById = async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id);

    if (!topic) {
      return res.status(404).json({
        message: "Topic not found",
      });
    }

    res.status(200).json({
      topic,
    });

  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Failed to fetch topic",
    });
  }
};