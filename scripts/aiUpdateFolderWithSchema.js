const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ---------------- CONFIG ----------------
const currentDir = "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/app/bookings/ticketings";
const schemaFileName = "TicketingBookings.js"; // schema reference file
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is not set.");
  process.exit(1);
}

// ---------------- OPENAI CLIENT ----------------
const client = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseOptions: { timeout: 60000 }, // 60s timeout
});

// ---------------- UTILITY FUNCTIONS ----------------
function getJSFiles(currentDir) {
  return fs
    .readdirSync(currentDir)
    .filter(f =>
      f.endsWith(".js") &&
      f !== schemaFileName &&
      !f.toLowerCase().includes("routes") // Exclude route files
    );
}

function getSchemaContent(currentDir, schemaFileName) {
  return fs.readFileSync(path.join(currentDir, schemaFileName), "utf-8");
}

function cleanCodeResponse(responseText) {
  return responseText.replace(/^```(?:javascript)?\n/, '').replace(/```$/, '').trim();
}

// Call OpenAI to update a file with retries
async function updateFileWithSchema(fileContent, schemaContent, fileName, retries = 2) {
  const prompt = `
You are a Node.js developer.

You have the following Mongoose schema:
${schemaContent}

Update the following file "${fileName}" according to this schema.

⚠ Important:
- Only return the updated file code.
- Do NOT include any explanations, instructions, or comments outside the code block.
- Preserve function names, routes, and existing logic.
- Implement Mongoose population for any refs in schema.
- Only modify what is necessary for the new schema.
- Add params and validation as needed.
- Ensure code syntax is correct.
- Preserve existing logic and comments.
- Keep the structure of the file intact.
- Respond only with the complete updated code.
- Revisit wherever the schema fields are used.


follow the schema strictly as we have single object instead of objects array.
const mongoose = require("mongoose");

const bookedTicketSchema = new mongoose.Schema(
    {
        ticketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ticketings",
            required: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },

        snapshot: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
    },
    { _id: false }
);

const ticketingBookingSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        tickets: {
            type: [bookedTicketSchema],
            required: true,
        },

        status: {
            type: String,
            enum: ["pending", "confirmed", "cancelled"],
            default: "pending",
        },

        orderPricing: {
            subtotal: Number,
            taxAmount: Number,
            total: Number,
            currency: { type: String, default: "€" },
        },

        transactionId: { type: String, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("TicketingBookings", ticketingBookingSchema);



File content
${fileContent}
`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      });

      if (!response?.choices?.length) throw new Error("No choices returned from OpenAI");

      return cleanCodeResponse(response.choices[0].message.content);
    } catch (err) {
      console.warn(`Attempt ${attempt + 1} failed for ${fileName}: ${err.message}`);
      if (attempt === retries) return fileContent;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function writeUpdatedFile(currentDir, fileName, updatedContent) {
  fs.writeFileSync(path.join(currentDir, fileName), updatedContent, "utf-8");
  console.log(`Updated file: ${fileName}`);
}

// ---------------- NEW FUNCTION: AI-based Postman JSON ----------------
async function generatePostmanJSONWithAI(schemaContent, outputFileName) {
  const prompt = `
You are a Node.js developer. 
Generate a realistic sample JSON object for testing according to the following Mongoose schema:

${schemaContent}

Rules:
- Only include fields present in the schema.
- Generate realistic values for each field based on its type:
  - Strings: realistic names, titles, or descriptions.
  - Numbers: reasonable values for the field context.
  - Boolean: true/false.
  - Date: ISO string.
  - ObjectId: valid placeholder ObjectId string.
  - Enum: pick the first value.
- Only return JSON content (no comments, explanations, or markdown).

Output JSON:
`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    if (!response?.choices?.length) throw new Error("No choices returned from OpenAI");

    let jsonContent = response.choices[0].message.content;

    // Clean Markdown code block if present
    jsonContent = jsonContent.replace(/^```(?:json)?\n/, '').replace(/```$/, '').trim();

    fs.writeFileSync(path.join(currentDir, outputFileName), jsonContent, "utf-8");
    console.log(`Postman JSON generated by AI: ${outputFileName}`);
  } catch (err) {
    console.error("❌ Error generating AI Postman JSON:", err.message);
  }
}

// ---------------- MAIN FUNCTION ----------------
async function updateFolderFiles() {
  try {
    const schemaContent = getSchemaContent(currentDir, schemaFileName);
    const jsFiles = getJSFiles(currentDir);

    if (!jsFiles.length) {
      console.log("No JS files found to update in folder.");
      return;
    }

    console.log(`\nProcessing ${jsFiles.length} files in parallel...`);

    await Promise.all(
      jsFiles.map(async (fileName) => {
        try {
          const filePath = path.join(currentDir, fileName);
          const fileContent = fs.readFileSync(filePath, "utf-8");

          const updatedContent = await updateFileWithSchema(fileContent, schemaContent, fileName);

          writeUpdatedFile(currentDir, fileName, updatedContent);
        } catch (err) {
          console.error(`❌ Unexpected error for ${fileName}:`, err.message);
        }
      })
    );

    console.log("\nAll files processed successfully!");

    // Generate AI-based Postman JSON after updating files
    const schemaName = path.basename(schemaFileName, ".js");
    await generatePostmanJSONWithAI(schemaContent, `${schemaName}.txt`);
  } catch (error) {
    console.error("Error updating folder files:", error.message);
  }
}

// ---------------- RUN SCRIPT ----------------
updateFolderFiles();
