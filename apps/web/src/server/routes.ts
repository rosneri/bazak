import { services } from "@bazak/services";
import { conversationHandlers } from "./http.ts";

export const routes = conversationHandlers(services);
