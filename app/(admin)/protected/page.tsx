import { redirect } from "next/navigation";

// 16. fázis: a bejelentkezés utáni kezdőoldal az irányítópult (a régi áttekintő helyett).
export default function ProtectedPage() {
  redirect("/iranyitopult");
}
