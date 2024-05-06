import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt  from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessandRefreshTokens = async(userId) =>{
   try {
      const user = await User.findById(userId)
      const accessToken = user.generateAccessToken()
      const refreshToken = user.generateRefreshToken()

      user.refreshToken = refreshToken
      await user.save({ validateBeforeSave: false })

      return { accessToken, refreshToken }

   } catch (error) {
      throw new ApiError(500, "Something went wrong while generating refresh and access tokens")

   }

};



const registerUser = asyncHandler(async (req, res) => {
   

   
   const {username, email, fullName, password} = req.body

   if ([username, email, fullName, password].some(
       (field) => ( field?.trim() === "" )
   )) {
       throw new ApiError(400, "All fields are required")
   }

   const userExists = await User.findOne({
       $or: [{ username }, { email }]
   })

   if (userExists) throw new ApiError(409, "user with username or email already exists")

   // console.log("req.files", req.files);

   const avatarLocalPath = req.files?.avatar[0]?.path
   // console.log("avatarLocalPath", avatarLocalPath);

   let coverImageLocalPath;
   if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
       coverImageLocalPath = req.files.coverImage[0].path
   }

   if (!avatarLocalPath) throw new ApiError(400, "Avatar file is required")

   const avatar = await uploadOnCloudinary(avatarLocalPath).catch((error) => console.log(error))
   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   // console.log(avatar);null
   if (!avatar) throw new ApiError(400, "Avatar file is required!!!.")

   const user = await User.create({
       fullName,
       avatar: {
           public_id: avatar.public_id,
           url: avatar.secure_url
       },
       coverImage: {
           public_id: coverImage?.public_id || "",
           url: coverImage?.secure_url || ""
       },
       username: username.toLowerCase(),
       email,
       password
   })

   const createdUser = await User.findById(user._id).select(
       "-password -refreshToken"
   )

   if (!createdUser) throw new ApiError(500, "user registration failed, please try again")

   return res.status(201).json(
       new ApiResponse(200, createdUser, "user registered successfully")
   )

});
const loginUser = asyncHandler(async (req, res) => {
   // req body -> data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send tokens in cookies

    const {email, username, password} = req.body;

    if (!(username || email)) {
        throw new ApiError(400, "username or email is required.");
    }

    const user = await User.findOne({
        $or: [{ email }, { username }]
    });

    if (!user) {
        throw new ApiError(404, "User doesnot exist.");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid user credentials.");
    }

    const { accessToken, refreshToken } = await generateAccessandRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select(" -password -refreshToken");

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: "None"
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser, accessToken, refreshToken
                },
                "User logged in successfully !!!."
            )
        );
})

const logoutUser = asyncHandler(async(req,res)=>{
   await User.findByIdAndUpdate(
      req.user._id,
      {
         $unset: {
            refreshToken: 1//this removes the field from document
         }
      },
      {new: true}
   )
   const options = {
      httpOnly: true,
      secure: true,
      sameSite: "None"
   }
    
   return res
   .status(200)
   .clearCookie("accessToken",options)
   .clearCookie("refreshToken",options)
   .json(new ApiResponse(200,{},"User logged out Successfully!"))

})

const refreshAccessToken = asyncHandler(async(req, res)=>{
   
   const incomingRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request");
    }

    const user = await User.findOne({
        refreshToken: incomingRefreshToken
    });

    if (!user) {
        throw new ApiError(401, "Invalid refresh token");
    }

    const { accessToken , refreshToken } = await generateAccessAndRefreshToken(user._id);

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: "None"
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken,
                    refreshToken
                },
                "Access token refreshed"
            )
        )
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
   const {oldPassword, newPassword}= req.body
   //const {oldPassword, newPassword, confirmPassword}= req.body
   //if(newPassword !==  confirmPassword) then throw error

   const user = await User.findById(req.user?._id)
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
   if(!isPasswordCorrect){
      throw new ApiError(400,"Invalid old Password")
   }

   user.password = newPassword
   await user.save({validateBeforeSave: false})

   return res
   .status(200)
   .json(new ApiResponse(200,{},"Password Updated Successfully!")
   )
})

const getCurrentUser = asyncHandler(async(req,res)=>{
   return res
   .status(200)
   .json(new ApiResponse(200, req.user,"Current User Fetched Successfully!"))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
   const { fullName, email} = req.body //changing username again and again is not good practice
   if(!fullName || !email){
      throw new ApiError(400,"All fields are required")
   }

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set: {
            fullName,email
         }
      },
      {new: true}//returns new updated values
   ).select("-select")

   return res
   .status(200)
   .json(new ApiResponse(200,user,"Account Details UPdated Successfully!"))

})

const updateUserAvatar = asyncHandler( async( req, res )=>{
   
   const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading avatar");
    }

    const user = await User.findById(req.user._id).select("avatar");

    const avatarToDelete = user.avatar.public_id;

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: {
                    public_id: avatar.public_id,
                    url: avatar.secure_url
                }
            }
        },
        { new: true }
    ).select("-password");

    if (avatarToDelete && updatedUser.avatar.public_id) {
        await deleteOnCloudinary(avatarToDelete);
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedUser, "Avatar update successfull")
        )
});
const updateUserCoverImage = asyncHandler( async( req, res )=>{
   
   const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "coverImage file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(400, "Error while uploading coverImage");
    }

    const user = await User.findById(req.user._id).select("coverImage");

    const coverImageToDelete = user.coverImage.public_id;

    const updatedUser = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: {
                    public_id: coverImage.public_id,
                    url: coverImage.secure_url
                }
            }
        },
        { new: true }
    ).select("-password");

    if (coverImageToDelete && updatedUser.coverImage.public_id) {
        await deleteOnCloudinary(coverImageToDelete);
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedUser, "coverImage update successfull")
        )
});
const getUserChannelProfile = asyncHandler(async(req,res)=>{
   const {username} = req.params;

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions", // The collection to join with
                localField: "_id", // Field from the current collection (User) to match
                foreignField: "channel", // Field from the 'subscriptions' collection to match
                as: "subscribers" // Alias for the joined data
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subcribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                subcribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1
            }
        }
    ]);

    // console.log(channel);
    if (!channel?.length) {
        throw new ApiError(404, "channel doesnot exist");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                channel[0],
                "User channel fetced successfully"
            )
        )
})

const getWatchHistory = asyncHandler(async(req,res)=>{
   const user = await User.aggregate([
      {
         $match: {
            _id :new mongoose.Types.ObjectId(req.user._id)
         }
      },{
         $lookup:{
            from: "videos",
            localField:"watchHistory",
            foreignField:"_id",
            as:"watchHistory",
            pipeline: [
               {
                  $lookup: {
                     from: "users",
                     localField: "owner",
                     foreignField:"_id",
                     as: "owner",
                     pipeline: [
                        {
                           $project:{
                              fullName:1,
                              username:1,
                              avatar:1
                           }
                        }
                     ]
                  }
               },
               {
                  $addFields:{
                     owner: {
                        $first: "$owner"
                     }
                  }
               }
            ]
         }
      }
   ])

   return res.status(200)
   .json(new ApiResponse(200,user[0].watchHistory, "Watch video fetched successfully!"))
})

export { 
   registerUser,
   loginUser,
   logoutUser,
   refreshAccessToken,
   changeCurrentPassword,
   getCurrentUser,
   updateAccountDetails,
   updateUserAvatar,
   updateUserCoverImage,
   getUserChannelProfile,
   getWatchHistory
};