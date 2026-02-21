// src/lib/types.ts
// ============================================================
// TypeScript types matching the Supabase schema.
// Tables are already created in Supabase — types only.
// ============================================================

export type OrderStatus = "new" | "in_progress" | "completed";

// ---- Row types (what comes back from Supabase selects) ----

export interface Order {
  id: string;                   // uuid
  order_number: number;
  customer_name: string | null;
  status: OrderStatus;
  total_price: number;
  created_at: string;           // ISO timestamp string
  started_at: string | null;    // set when status → in_progress
  completed_at: string | null;  // set when status → completed
}

export interface OrderItem {
  id: string;                   // uuid
  order_id: string;             // uuid — foreign key → orders.id
  item_name: string;
  size: string;                 // "small" | "large"
  temp: string;                 // "hot" | "iced"
  milk: string | null;          // null for non-milk drinks
  sweetness: string;            // SweetnessLevel
  ice_level: string;            // IceLevel (irrelevant for hot/blended, stored anyway)
  add_ons: AddOnLineItem[];     // json array
  item_price: number;
  special_instructions: string | null;
}

// Shape of each element in the add_ons JSON array
export interface AddOnLineItem {
  name: string;
  qty: number;
  unit_price: number;
}

// ---- Order with its items (joined) ----

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

// ---- Insert types (for creating new rows) ----

export type NewOrder = Omit<Order, "id" | "created_at" | "started_at" | "completed_at"> & {
  id?: string;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type NewOrderItem = Omit<OrderItem, "id"> & {
  id?: string;
};

// ---- Supabase Database generic type (used to type the client) ----
//
// Supabase v2's GenericSchema requires Views, Functions, Enums,
// CompositeTypes, and each table must have a Relationships array.
// Without these the query builder collapses insert/select types to `never`.

export interface Database {
  public: {
    Tables: {
      orders: {
        Row: Order;
        Insert: NewOrder;
        Update: Partial<NewOrder>;
        Relationships: [];
      };
      order_items: {
        Row: OrderItem;
        Insert: NewOrderItem;
        Update: Partial<NewOrderItem>;
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
