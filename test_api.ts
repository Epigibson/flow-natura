import dotenv from 'dotenv';

// Load env variables
dotenv.config();

// Set EXPO variables so src/lib/supabase.ts can find them under Node
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;

// Dynamically import supabase and api to ensure env variables are set first
const { supabase } = await import('./src/lib/supabase');
const { products, inventory } = await import('./src/lib/api');

console.log("Supabase URL:", process.env.EXPO_PUBLIC_SUPABASE_URL);

async function run() {
  const email = process.env.NATURA_USER;
  const password = process.env.NATURA_PASS;
  
  if (!email || !password) {
    console.error("Missing test credentials in .env");
    process.exit(1);
  }
  
  console.log(`Logging in as ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error("Login failed:", authError);
    process.exit(1);
  }
  
  console.log("Logged in successfully. User ID:", authData.user.id);
  
  // Test cases:
  // 1. Create a unique product code
  const uniqueCode = "TEST-" + Math.floor(Math.random() * 1000000);
  console.log(`\n[Test Case 1] Creating a brand new product with code ${uniqueCode}`);
  
  const productData = {
    name: "Producto de Prueba " + uniqueCode,
    code: uniqueCode,
    price: 150.00,
    cost: 100.00,
    points: 10,
    brand: "Natura",
    category: "Rostro",
    stock: 5 // should add 5 to inventory
  };
  
  try {
    const newProduct = await products.create(productData);
    console.log("Created successfully. Product ID:", newProduct.id);
    
    // Check inventory
    const invList = await inventory.list();
    const invItem = invList.find((i: any) => i.product_id === newProduct.id);
    console.log("Inventory check:", invItem);
    if (invItem && invItem.quantity === 5) {
      console.log("Case 1 SUCCESS: Product created and stock bound to inventory.");
    } else {
      console.error("Case 1 FAILED: Stock not bound to inventory correctly.", invItem);
      process.exit(1);
    }
    
    // 2. Register/Create again with the SAME code
    console.log(`\n[Test Case 2] Creating a product with existing code ${uniqueCode}`);
    const duplicateProductData = {
      ...productData,
      name: "Producto de Prueba Modificado " + uniqueCode,
      price: 160.00, // modified price
      stock: 3 // should add 3 more to inventory (total 8)
    };
    
    const dupeProduct = await products.create(duplicateProductData);
    console.log("Dupe product result (name):", dupeProduct.name, "(price):", dupeProduct.price);
    
    // Verify it updated the catalog name and price
    if (dupeProduct.id === newProduct.id && dupeProduct.price === 160 && dupeProduct.name === duplicateProductData.name) {
      console.log("Case 2 part 1 SUCCESS: Catalog product details updated correctly.");
    } else {
      console.error("Case 2 part 1 FAILED: Product ID mismatch or details not updated.");
      process.exit(1);
    }
    
    // Verify inventory increased
    const invList2 = await inventory.list();
    const invItem2 = invList2.find((i: any) => i.product_id === newProduct.id);
    console.log("Inventory check after duplicate insert:", invItem2);
    if (invItem2 && invItem2.quantity === 8) {
      console.log("Case 2 part 2 SUCCESS: Stock successfully accumulated.");
    } else {
      console.error("Case 2 part 2 FAILED: Stock not accumulated correctly.");
      process.exit(1);
    }
    
    // 3. Delete (soft-delete) the product
    console.log(`\n[Test Case 3] Soft-deleting product ${newProduct.id}`);
    await products.delete(newProduct.id);
    
    // List active products and check if it is still there
    const activeProducts = await products.list();
    const foundActive = activeProducts.find((p: any) => p.id === newProduct.id);
    console.log("Active products search (should be undefined):", foundActive);
    
    // List all products including deleted
    const { data: foundAll, error: errAll } = await supabase
      .rpc('list_all_products', { p_include_deleted: true })
      .eq('id', newProduct.id)
      .maybeSingle();
    
    if (errAll) throw errAll;
    console.log("All products search (should be found with deleted_at):", foundAll ? { id: foundAll.id, deleted_at: foundAll.deleted_at } : null);
    
    if (!foundActive && foundAll && foundAll.deleted_at) {
      console.log("Case 3 SUCCESS: Product soft-deleted successfully.");
    } else {
      console.error("Case 3 FAILED: Product was not soft-deleted correctly.");
      process.exit(1);
    }
    
    // 4. Register product again with the same code (restoring it)
    console.log(`\n[Test Case 4] Creating/restoring soft-deleted product with code ${uniqueCode}`);
    const restoreProductData = {
      ...productData,
      name: "Producto de Prueba Restaurado " + uniqueCode,
      price: 170.00,
      stock: 2 // should add 2 more to inventory (total 10)
    };
    
    const restoredProduct = await products.create(restoreProductData);
    console.log("Restored product result (name):", restoredProduct.name, "(deleted_at):", restoredProduct.deleted_at);
    
    const { data: foundActive2, error: errActive2 } = await supabase
      .from('products')
      .select('*')
      .eq('id', newProduct.id)
      .is('deleted_at', null)
      .maybeSingle();
    
    if (errActive2) throw errActive2;
    console.log("Active products search after restore (should be found):", foundActive2);
    
    const invList3 = await inventory.list();
    const invItem3 = invList3.find((i: any) => i.product_id === newProduct.id);
    console.log("Inventory check after restore:", invItem3);
    
    if (foundActive2 && !restoredProduct.deleted_at && invItem3 && invItem3.quantity === 10) {
      console.log("Case 4 SUCCESS: Product successfully restored and inventory stock accumulated.");
    } else {
      console.error("Case 4 FAILED: Product restoration or inventory accumulation failed.");
      process.exit(1);
    }
    
    // Cleanup: permanently delete from inventory and products using supabase client directly
    console.log("\nCleaning up test data...");
    await supabase.from('inventory').delete().eq('product_id', newProduct.id);
    const { error: cleanupError } = await supabase.from('products').delete().eq('id', newProduct.id);
    if (cleanupError) {
      console.warn("Cleanup warning (could not hard delete product):", cleanupError.message);
    } else {
      console.log("Test data cleaned up successfully.");
    }
    
    console.log("\nALL API TESTS PASSED SUCCESSFULLY! 🎉");
    
  } catch (error) {
    console.error("Test failed with error:", error);
    process.exit(1);
  }
}

run();
