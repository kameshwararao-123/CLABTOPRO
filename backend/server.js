import express from 'express'
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './configs/db.js';

import authRoutes from "./routes/authRoutes.js";
import topicRoutes from "./routes/topicRoutes.js";
import problemRoutes from "./routes/problemRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";


const app=express();
//for configurations..
app.use(cors());
dotenv.config();
app.use(express.json());
//mongodb connection...
await connectDB();
//route...
app.use("/api/auth", authRoutes);

app.use("/api/topics", topicRoutes);

app.use("/api/problems", problemRoutes);

app.use("/api/submissions", submissionRoutes);

app.use("/api/progress", progressRoutes);

app.use("/api/admin", adminRoutes);

//for server testing.....
app.get("/",(req,res)=>{
    res.send("welcome to clab to pro server runs successfully")
});
//for server...
app.listen(process.env.PORT,()=>{
    console.log("server runs successfully on 3400");
})
