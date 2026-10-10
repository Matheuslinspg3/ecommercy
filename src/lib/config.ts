import rawConfig from "../../store.config.json";
import { storeConfigSchema } from "./models";
export const installationConfig = storeConfigSchema.parse(rawConfig);
