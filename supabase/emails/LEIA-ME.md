# E-mails do Palco Keys (Supabase Auth, enviados pelo Resend)

Cole cada arquivo em Supabase > Authentication > Emails > Templates:

| Arquivo | Modelo no Supabase | Assunto sugerido |
|---|---|---|
| confirmar-conta.html | Confirm sign up | Confirme o seu e-mail no Palco Keys |
| nova-senha.html | Reset password | Nova senha do Palco Keys |
| codigo-de-acesso.html | Magic link | Seu acesso ao Palco Keys |

Remetente (Authentication > Emails > SMTP Settings): host smtp.resend.com, porta 465, usuário `resend`, senha = chave de API do Resend, e-mail de envio `nao-responder@palcokeys.com.br`, nome `Palco Keys`.
O logo vem de https://palcokeys.com.br/app/icon-192.png.
