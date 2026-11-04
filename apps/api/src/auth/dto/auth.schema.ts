import { z } from 'zod';

const email = z
  .string({ message: 'E-mail inválido' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'E-mail inválido' }));

export const registerSchema = z.object({
  name: z.string({ message: 'Informe o seu nome' }).trim().min(2, 'Informe o seu nome').max(80),
  email,
  password: z
    .string({ message: 'Informe a senha' })
    .min(8, 'A senha precisa de pelo menos 8 caracteres')
    .max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string({ message: 'Informe a senha' }).min(1, 'Informe a senha'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleLoginSchema = z.object({
  credential: z.string().min(1),
});
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
