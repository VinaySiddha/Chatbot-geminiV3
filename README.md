```env
  PORT=5001 # Port for the backend (make sure it's free)
  MONGO_URI=mongodb://localhost:27017/chatbot_gemini # Your MongoDB connection string
  JWT_SECRET=your_super_strong_and_secret_jwt_key_12345! # A strong, random secret key for JWT
  GEMINI_API_KEY=YOUR_GOOGLE_GEMINI_API_KEY_HERE # Your actual Gemini API Key
```

* **MONGO_URI:**
  * For local MongoDB: `mongodb://localhost:27017/chatbot_gemini` (or your chosen DB name).
  * For MongoDB Atlas: Get the connection string from your Atlas cluster (replace `<password>` and specify your database name). Example: `mongodb+srv://<username>:<password>@yourcluster.mongodb.net/chatbot_gemini?retryWrites=true&w=majority`
* **JWT_SECRET:** Generate a strong random string for security.
* **GEMINI_API_KEY:** Paste the key you obtained from Google AI Studio.




# Chatbot Gemini V3

A full-stack chatbot application using Gemini API, with a React frontend and Node.js/Express backend.

## Features

- User authentication (JWT)
- File upload and management
- Chat interface powered by Gemini API
- RAG (Retrieval-Augmented Generation) service
- MongoDB database integration

## Project Structure

```
client/         # React frontend
public/         # Static files (index.html, icons, etc.)
server/         # Node.js backend (Express)
  ├── config/   # Configuration files (db.js, cors.js)
  ├── models/   # Mongoose models
  ├── routes/   # API routes
  ├── services/ # Gemini and other services
  ├── utils/    # Utility scripts
  └── rag_service/ # RAG and indexing
src/            # React app source code
```

## Getting Started

### Prerequisites

- Node.js (v16+ recommended)
- npm
- MongoDB (local or Atlas)

### Installation

1. **Clone the repository:**

   ```sh
   git clone <your-repo-url>
   cd Chatbot-geminiV3
   ```
2. **Install dependencies:**

   - Backend:

     ```sh
     cd server
     npm install
     ```
   - Frontend:

     ```sh
     cd ../client
     npm install
     ```
3. **Set up environment variables:**

   Create a `.env` file in the `server/` directory with the following content:

   ```env
   PORT=5001
   MONGO_URI=mongodb://localhost:27017/chatbot_gemini
   JWT_SECRET=your_super_strong_and_secret_jwt_key_12345!
   GEMINI_API_KEY=YOUR_GOOGLE_GEMINI_API_KEY_HERE
   ```
4. **Start the backend:**

   ```sh
   cd server
   npm start
   ```
5. **Start the frontend:**

   ```sh
   cd ../client
   npm start
   ```
6. **Open your browser:**
   Visit [http://localhost:3000](http://localhost:3000)

## License

MIT

---

**Note:**

- Make sure MongoDB is running locally or update `MONGO_URI` for Atlas.
- Replace `GEMINI_API_KEY` with your actual API key from Google AI Studio.
