import {
  AgentKit,
  CdpWalletProvider,
  wethActionProvider,
  walletActionProvider,
  erc20ActionProvider,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  pythActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as readline from "readline";
import {freelancerActionProvider} from "./freelancer"
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import admin from "firebase-admin";
import { readFileSync } from "fs";

// Load service account key (Replace with the actual path)
const serviceAccount = JSON.parse(readFileSync("./service-account.json", "utf8"));

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Export Firestore and Auth
const db = admin.firestore();
const auth = admin.auth();
let useremail= ""
let searchTerm=""
let searchInterval =0
let agentOwner = ""
let pauseAgent= false;
dotenv.config();


async function sendMail(message:string){
  const transporter = nodemailer.createTransport({
    service: "SendGrid",
    auth: {
      user: "apikey",
      pass: process.env.SENDGRID_API_KEY,
    },
  });

  
  const mailOptions = {
    from: "dominichackett@gmail.com",
    to:useremail,
    subject:"WorkMate Job Alert",
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log({ success: true, message: "Email sent successfully!",body: message});
  } catch (error) {
    console.error(error);
    //res.status(500).json({ success: false, error: error.message });
  }

}

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
function validateEnvironment(): void {
  const missingVars: string[] = [];

  // Check required variables
  const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  // Exit if any required variables are missing
  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach(varName => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  // Warn about optional NETWORK_ID
  if (!process.env.NETWORK_ID) {
    console.warn("Warning: NETWORK_ID not set, defaulting to base-sepolia testnet");
  }
}

// Add this right after imports and before any other code
validateEnvironment();

// Configure a file to persist the agent's CDP MPC Wallet Data
const WALLET_DATA_FILE = "wallet_data.txt";

/**
 * Initialize the agent with CDP Agentkit
 *
 * @returns Agent executor and config
 */
async function initializeAgent() {
  try {
    // Initialize LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
    });

    let walletDataStr: string | null = null;

    // Read existing wallet data if available
    if (fs.existsSync(WALLET_DATA_FILE)) {
      try {
        walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
      } catch (error) {
        console.error("Error reading wallet data:", error);
        // Continue without wallet data
      }
    }

    // Configure CDP Wallet Provider
    const config = {
      apiKeyName: process.env.CDP_API_KEY_NAME,
      apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      cdpWalletData: walletDataStr || undefined,
      networkId: process.env.NETWORK_ID || "base-sepolia",
    };

    const walletProvider = await CdpWalletProvider.configureWithWallet(config);

    // Initialize AgentKit
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        freelancerActionProvider(),
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider({
          apiKeyName: process.env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
        cdpWalletActionProvider({
          apiKeyName: process.env.CDP_API_KEY_NAME,
          apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      ],
    });

    const tools = await getLangChainTools(agentkit);

    // Store buffered conversation history in memory
    const memory = new MemorySaver();
    const agentConfig = { configurable: { thread_id: "CDP AgentKit Chatbot Example!" } };

    // Create React Agent using the LLM and CDP AgentKit tools
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are 
        empowered to interact onchain using your tools. If you ever need funds, you can request them from the 
        faucet if you are on network ID 'base-sepolia'. If not, you can provide your wallet details and request 
        funds from the user. Before executing your first action, get the wallet details to see what network 
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
        asks you to do something you can't do with your currently available tools, you must say so, and 
        encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to 
        docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from 
        restating your tools' descriptions unless it is explicitly requested.
        `,
    });

    // Save wallet data
   const exportedWallet = await walletProvider.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(exportedWallet));

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Run the agent autonomously with specified intervals
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAutonomousMode(agent: any, config: any) {
  console.log("Starting autonomous mode...");
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await getSearchParams()
      let interval = 60*searchInterval
        
      const thought = "Search freelancer for jobs fitting the following description. ".concat(searchTerm);
       
       if(pauseAgent) //Don't execute agent commands if paused
       {
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
        continue

       }
         

      const stream = await agent.stream({ messages: [new HumanMessage(thought)] }, config);
  
      for await (const chunk of stream) {
        if ("agent" in chunk) {
          const _data =chunk.agent.messages[0].content 
          if(_data)
          {
             console.log(_data);
             sendMail(_data)
          }
        
        //  console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          const jobs = JSON.parse(chunk.tools.messages[0].content);

           console.log(jobs.result.projects.length)
           for (const job of jobs.result.projects) { 
            //console.log(job.id);
            console.log(job.id)
            if (job.id) {
                await db.collection("jobs").doc(job.id.toString()).set({
                    ...job,
                    owner: agentOwner
                });
            }
        }
          //console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

async function getSearchParams() {
  if (!process.env.AGENT_OWNER) {
    throw new Error("AGENT_OWNER is not set in environment variables.");
  }

  agentOwner = process.env.AGENT_OWNER
  const profile =  await db.collection("profile").doc(agentOwner).get()
  useremail = profile?.data()?.email
  console.log(profile)
  const search =  await db.collection("search").doc(agentOwner).get()
 console.log(profile)
  searchInterval = search?.data()?.interval
  searchTerm  = search?.data()?.terms
  pauseAgent = search?.data()?.paused

}
/**
 * Start the chatbot agent
 */
async function main() {
  try {
    
    const { agent, config } = await initializeAgent();
    await runAutonomousMode(agent, config);
    
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  console.log("Starting Agent...");
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
