import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// Server-side Supabase client initialization
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bibwmbcoqmgjdllwjmar.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  'sb_publishable_U_J5AstiSSMcRf0i1CdqOA_-VJA72B0'
);

export async function POST(request: Request) {
  try {
    const { record } = await request.json();

    if (!record) {
      return NextResponse.json({ error: 'No match record provided' }, { status: 400 });
    }

    // 1. Database theke SUDHU MATRO 'player' role-er user-der email fetch kora
    const { data: players, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name, role')
      .eq('role', 'player'); // Only fetch users with role = 'player'

    if (userError || !players || players.length === 0) {
      return NextResponse.json({ error: 'No players found with role = player' }, { status: 400 });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      return NextResponse.json({ error: 'Missing GMAIL_USER or GMAIL_APP_PASSWORD' }, { status: 500 });
    }

    // 2. Nodemailer Transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smash-club-hq-swz8.vercel.app';
    const dashboardUrl = `${siteUrl}/dashboard`;

    let sentCount = 0;

    // 3. For loop chaliye SODHU 'player'-der kache alada alada mail pathano
    for (const p of players) {
      if (p.email) {
        try {
          await transporter.sendMail({
            from: `"SmashClub HQ" <${gmailUser}>`,
            to: p.email,
            subject: `🏸 New Match Slot Announced: ${record.location}`,
            html: `
              <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #ffffff; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #34d399; margin-bottom: 8px;">🏸 SmashClub HQ</h2>
                <p style="color: #94a3b8; font-size: 14px;">New Badminton Match Slot Published!</p>
                
                <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px; margin: 20px 0;">
                  <h3 style="color: #f8fafc; margin-top: 0;">📍 Location: ${record.location}</h3>
                  <p style="color: #cbd5e1; margin: 6px 0;">📅 <strong>Date:</strong> ${record.match_date}</p>
                  <p style="color: #cbd5e1; margin: 6px 0;">⏰ <strong>Time:</strong> ${record.match_time}</p>
                </div>

                <p style="color: #cbd5e1; font-size: 14px;">Hi ${p.full_name || 'Player'}, please mark your <strong>IN</strong> / <strong>OUT</strong> attendance RSVP.</p>

                <div style="text-align: center; margin-top: 25px;">
                  <a href="${dashboardUrl}" style="background-color: #10b981; color: #022c22; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">🚀 View Match & RSVP</a>
                </div>
              </div>
            `,
          });
          sentCount++;
        } catch (mailErr) {
          console.error(`Failed to send email to player ${p.email}:`, mailErr);
        }
      }
    }

    return NextResponse.json({ success: true, count: sentCount });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}