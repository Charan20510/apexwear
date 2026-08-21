import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import Landing from "./landing/Landing.jsx";
import WishlistPage from "./landing/components/WishlistPage.jsx";
import CartPage from "./landing/components/CartPage.jsx";

function App() {
  return (
    <Routes>
      {/* The landing page brings its own Nav and Footer, so it sits outside Layout. */}
      <Route path="/" element={<Landing />} />
      <Route path="/mywishlist" element={<WishlistPage />} />
      <Route path="/cart" element={<CartPage />} />
      {/* Old path kept so existing links and bookmarks don't dead-end. */}
      <Route path="/wishlist" element={<Navigate to="/mywishlist" replace />} />

      <Route element={<Layout />}>
        <Route path="/shop" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
    </Routes>
  );
}

export default App;
