export type UnitType = 'piece' | 'weight';

export type Product = {
  id: string;
  name: string;
  barcode: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  unit_type: UnitType;
  created_at?: string;
};

export type CartLine = {
  id: string; // stable unique per added entry (fixes remove-by-barcode colliding weight grams)
  productId: string;
  name: string;
  barcode: string;
  price: number; // sell_price per unit / per kg
  qty: number; // pieces or kg (weight: qty is kg)
  unit: UnitType;
  grams?: number; // original grams for weight entries (for display/precision)
  lineTotal: number;
};

export type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'worker';
  permissions: string[];
};

export type ExpenseRow = {
  id: string;
  reason: string;
  amount: number;
  user_id?: string;
  created_at: string;
};

export type ShiftStats = {
  totalSales: number;
  invoices: number;
  itemsSold: number; // pieces + kg
};
