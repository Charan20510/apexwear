import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { ProductDetail } from "./pages/ProductDetail";
import { HoodieRedirect } from "./pages/HoodieRedirect";
import { Profile } from "./pages/Profile";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { RequireAuth, RequireAuthPrompt, RedirectIfAuthed } from "./components/RequireAuth";
import Landing from "./landing/Landing.jsx";
import WishlistPage from "./landing/components/WishlistPage.jsx";
import CartPage from "./landing/components/CartPage.jsx";
import InfoPage from "./landing/components/InfoPage.jsx";

function App() {
  return (
    <Routes>
      {/* The landing page brings its own Nav and Footer, so it sits outside Layout. */}
      <Route path="/" element={<Landing />} />
      <Route element={<RequireAuthPrompt />}>
        <Route path="/mywishlist" element={<WishlistPage />} />
        <Route path="/cart" element={<CartPage />} />
      </Route>
      {/* Old path kept so existing links and bookmarks don't dead-end. */}
      <Route path="/wishlist" element={<Navigate to="/mywishlist" replace />} />

      {/* Auth pages bring their own landing Nav/Footer too (see Login.tsx etc.),
          so they also sit outside Layout — same reasoning as Landing above. */}
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route element={<Layout />}>
        <Route element={<RequireAuth />}>
          <Route path="/shop" element={<Home />} />
          <Route path="/shop/:slug" element={<ProductDetail />} />
          {/* Canonical product URL stays /shop/:slug; this alias resolves an id
              or slug and redirects to it, so /shop/hoodie/<id> never 404s. */}
          <Route path="/shop/hoodie/:slugOrId" element={<HoodieRedirect />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      {/* Catches the footer's info links (About, Returns, Size guide, …) and doubles
          as the 404: React Router ranks the static routes above, so an unknown path
          only reaches here and InfoPage renders its "not found" branch. */}
      <Route path="/:slug" element={<InfoPage />} />
    </Routes>
  );
}

export default App;
