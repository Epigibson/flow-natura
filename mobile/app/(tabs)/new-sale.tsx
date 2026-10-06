import { Redirect } from 'expo-router';

/** Placeholder route for the center "+ Venta" tab button, which navigates to /sales/new itself. */
export default function NewSaleTab() {
  return <Redirect href="/sales/new" />;
}
