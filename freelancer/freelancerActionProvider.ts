import { z } from "zod";
import { ActionProvider } from "@coinbase/agentkit";
import { CreateAction } from "@coinbase/agentkit";
import { FreelancerQuerySchema } from "./schemas";

/**
 * FreelancerActionProvider is an action provider for Freelancer
 */
export class FreelancerActionProvider extends ActionProvider {
    /**
     * Constructs a new FreelancerActionProvider.
     */
    constructor() {
      super("freelancer", []);
    }
  
    @CreateAction({
        name: "queryFreelancer",
        description: "When the agent is asked to search for a job on freelancer. This function is called. based on the job descriptions write a proposal to the job.",
        schema: FreelancerQuerySchema,
    })
    async queryFreelancer(args: z.infer<typeof FreelancerQuerySchema>): Promise<string> {
        if (!process.env.FREELANCER_TOKEN) {
            throw new Error("FREELANCER_TOKEN is not configured.");
          }

    const url = `https://www.freelancer.com/api/projects/0.1/projects/active/?compact=&limit=30&full_description=true&project_types[]=fixed&max_avg_price=500&min_avg_price=250&query=${args.query}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
          'freelancer-oauth-v1': '<oauth_access_token>',
        },
      });
    
      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }
    
      const data = await response.json();
        return data;
    }



    supportsNetwork = () => true;
  }
  
  export const freelancerActionProvider = () => new FreelancerActionProvider();