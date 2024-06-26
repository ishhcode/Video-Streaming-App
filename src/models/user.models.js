import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = mongoose.Schema({
    username: {
        type:String,
        required: [true, 'username is required'],
        unique: true,
        lowercase: true,
        trim:true,
        index: true,  //for searching in database
    },
    email: {
        type:String,
        required: [true, 'email is required'],
        unique: true,
        lowercase: true,
        trim:true,
    },
    fullName: {
        type:String,
        required: [true, 'fullname is required'],
        trim:true,
        index: true,  //for searching in database
    },
    watchHistory: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Videos",
        }
    ],
    avatar:{
        type: {
            public_id: String,
            url: String //cloudinary url
        },
        required:true,
    },
    coverImage:{
        type: {
            public_id: String,
            url: String //cloudinary url
        },
    },
    password: {
        type: String,
        required: [true, "Password is required"],
    },
    refreshToken: {
        type: String,
    }
},
{timestamps: true}
)

userSchema.pre("save", async function (next) {
    if(!this.isModified("password")) next();
    this.password = await bcrypt.hash(this.password, 10)
    return next()
})

userSchema.methods.isPasswordCorrect = async function (password){
    return await bcrypt.compare(password,this.password)
}

userSchema.methods.generateAccessToken= function () {
    return jwt.sign({
        _id : this._id,
        username: this.username,
        email: this.email,
        fullName: this.fullName
    },
    process.env.ACCESS_TOKEN_SCERET,
    {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY
    }
    )
}
userSchema.methods.generateRefreshToken = function(){
    return jwt.sign({
        _id : this._id,
        
    },
    process.env.REFRESH_TOKEN_SCERET,
    {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY
    }
    )
}



export const User = mongoose.model("User",userSchema);