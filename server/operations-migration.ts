import type { StoreData } from "./storage.js";
export function migrateOperations(data:StoreData){let changed=false;for(const name of ["workFiles","taskNotificationEvents"])if(!Array.isArray(data.collections[name])){data.collections[name]=[];changed=true;}return changed;}
