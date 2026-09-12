import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      slug: string
      estado: string
      admin: boolean
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string
    slug?: string
    nombre?: string
    estado?: string
    admin?: boolean
  }
}
