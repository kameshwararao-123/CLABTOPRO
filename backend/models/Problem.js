import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema(
  {
    input: {
      type: String,
      required: true,
    },

    expectedOutput: {
      type: String,
      required: true,
    },

    isHidden: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: false,
  }
);

const problemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    topic: {
      type: String,
      required: true,
      enum: [
        "Basics",
        "Input/Output",
        "Conditional Statements",
        "Loops",
        "Arrays",
        "Functions",
        "Strings",
        "Pointers",
      ],
    },

    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Easy",
    },

    inputFormat: {
      type: String,
      default: "",
    },

    outputFormat: {
      type: String,
      default: "",
    },

    constraints: {
      type: String,
      default: "",
    },

    sampleInput: {
      type: String,
      default: "",
    },

    sampleOutput: {
      type: String,
      default: "",
    },

    testCases: {
      type: [testCaseSchema],
      default: [],
    },

    publishDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Problem = mongoose.model(
  "Problem",
  problemSchema
);

export default Problem;