export type ShopSupportMessage = {id:string;from:"customer"|"store";message:string;at:string};
export type ShopSupportTicket = {id:string;subject:string;category:string;orderId:string;status:"open"|"waiting"|"resolved";version:number;createdAt:string;updatedAt:string;messages:ShopSupportMessage[];customer?:string;email?:string;phone?:string};
