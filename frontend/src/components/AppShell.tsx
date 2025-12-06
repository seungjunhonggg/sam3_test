'use client';

import { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppShell,
  Group,
  Text,
  UnstyledButton,
  Stack,
  Box,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import {
  IconFolder,
  IconBrain,
  IconSettings,
  IconPhoto,
  IconSparkles,
} from '@tabler/icons-react';
import classes from './AppShell.module.css';

interface NavItem {
  icon: typeof IconFolder;
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: IconFolder, label: '프로젝트', href: '/' },
  { icon: IconBrain, label: '학습', href: '/training' },
  { icon: IconSettings, label: '설정', href: '/settings' },
];

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}

function NavLink({ item, active, onClick }: NavLinkProps) {
  const theme = useMantineTheme();
  const Icon = item.icon;

  return (
    <Tooltip label={item.label} position="right" withArrow>
      <UnstyledButton
        onClick={onClick}
        className={classes.navLink}
        data-active={active || undefined}
      >
        <Icon size={22} stroke={1.5} />
      </UnstyledButton>
    </Tooltip>
  );
}

interface AppShellWrapperProps {
  children: ReactNode;
}

export function AppShellWrapper({ children }: AppShellWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useMantineTheme();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname.startsWith('/projects');
    }
    return pathname.startsWith(href);
  };

  return (
    <AppShell
      navbar={{
        width: 70,
        breakpoint: 'sm',
      }}
      padding={0}
    >
      <AppShell.Navbar className={classes.navbar}>
        <Stack h="100%" justify="space-between" align="center" py="md">
          {/* Logo */}
          <Box>
            <UnstyledButton
              className={classes.logo}
              onClick={() => router.push('/')}
            >
              <IconSparkles size={28} stroke={1.5} color={theme.colors.appleBlue[6]} />
            </UnstyledButton>
          </Box>

          {/* Navigation */}
          <Stack gap="xs" align="center">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onClick={() => router.push(item.href)}
              />
            ))}
          </Stack>

          {/* Spacer */}
          <Box />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
