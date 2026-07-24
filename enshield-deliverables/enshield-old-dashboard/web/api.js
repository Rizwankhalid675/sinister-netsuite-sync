// Sets up the API client for interacting with your backend.
// For your API reference, visit: https://docs.gadget.dev/api/enshield-shipping-protection
import { Client } from "@gadget-client/enshield-shipping-protection";

export const api = new Client({ environment: window.gadgetConfig.environment });