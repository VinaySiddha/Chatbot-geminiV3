import google.generativeai as genai

# Replace with your actual API key
API_KEY = "AIzaSyDs2GE0ttB2Q93w5SsW03SKXb1edNMbdcU"

# Configure the API key
genai.configure(api_key=API_KEY)

try:
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content("Hello Gemini, how are you?")
    print("✅ Response from Gemini:")
    print(response.text)
except Exception as e:
    print("❌ Failed to connect to Gemini API:")
    print(e)
