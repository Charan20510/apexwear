import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { HoodieRedirect } from "./pages/HoodieRedirect";
import { Profile } from "./pages/Profile";
import { Addresses } from "./pages/Addresses";
import { Orders } from "./pages/Orders";
import { OrderDetail } from "./pages/OrderDetail";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { RequireAuth, RequireAuthPrompt, RedirectIfAuthed } from "./components/RequireAuth";
import Landing from "./landing/Landing.jsx";
import WishlistPage from "./landing/components/WishlistPage.jsx";
import CartPage from "./landing/components/CartPage.jsx";
import InfoPage from "./landing/components/InfoPage.jsx";

// Top-level router: the landing UI and the /shop Tailwind shell share this tree.
function App() {
  return (
    <Routes>
      {/* Landing brings its own Nav/Footer, so it sits outside Layout. */}
      <Route path="/" element={<Landing />} />
      <Route element={<RequireAuthPrompt />}>
        <Route path="/mywishlist" element={<WishlistPage />} />
        <Route path="/cart" element={<CartPage />} />
      </Route>
      <Route path="/wishlist" element={<Navigate to="/mywishlist" replace />} />

      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route element={<Layout />}>
        <Route element={<RequireAuth />}>
          <Route path="/shop" element={<Home />} />
          <Route path="/shop/:slug" element={<ProductDetail />} />
          {/* Alias so /shop/hoodie/<id-or-slug> resolves and redirects, never 404s. */}
          <Route path="/shop/hoodie/:slugOrId" element={<HoodieRedirect />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/addresses" element={<Addresses />} />
          <Route path="/profile/orders" element={<Orders />} />
          <Route path="/profile/orders/:number" element={<OrderDetail />} />
        </Route>
      </Route>

      {/* Footer info links (About, Returns, …) plus the 404 fallback — static routes above win first. */}
      <Route path="/:slug" element={<InfoPage />} />
    </Routes>
  );
}

export default App;
