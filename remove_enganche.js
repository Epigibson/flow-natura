import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: allOrders, error } = await supabase.from('orders').select('id, notes').order('created_at', { ascending: false }).limit(50);
  if (error) {
    console.error(error);
    return;
  }
  
  const orders = allOrders.filter(o => o.id.toLowerCase().startsWith('9d8bce26'));
  
  if (orders.length === 0) {
    console.log("No order found");
    return;
  }
  
  const order = orders[0];
  console.log("Found order:", order.id);
  
  let notes = {};
  if (order.notes) {
    notes = typeof order.notes === 'string' ? JSON.parse(order.notes) : order.notes;
  }
  
  console.log("Current notes:", notes);
  
  // Remove enganche
  notes.enganche = 0;
  
  const { error: updateError } = await supabase.from('orders').update({ notes: JSON.stringify(notes) }).eq('id', order.id);
  
  if (updateError) {
    console.error("Failed to update:", updateError);
  } else {
    console.log("Successfully removed enganche!");
  }
}

run();
